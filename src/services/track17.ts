import { env } from "../config/env.js";
import {
	TRACK_MILESTONE_STAGES,
	TRACK_STATUSES,
	type TrackMilestone,
	type TrackResult,
	type TrackStatus,
	type TrackingEvent,
} from "../types/index.js";

const BASE_URL = env.TRACK17_BASE_URL;

/** Error codes we branch on. See https://api.17track.net/en/doc?anchor=api-errorcode */
const CODE = {
	// Our own account/config problems — never the caller's fault.
	IP_NOT_WHITELISTED: -18010001,
	INVALID_KEY: -18010002,
	INTERNAL: -18010003,
	ACCOUNT_DISABLED: -18010004,
	UNAUTHORIZED: -18010005,
	QUOTA_EXHAUSTED: -18019908,
	DAILY_LIMIT: -18019907,
	// The caller must supply an additional field for this carrier.
	NEEDS_COUNTRY_AND_POSTAL_CODE: -18010018,
	NEEDS_POSTAL_CODE: -18010019,
	NEEDS_PHONE: -18010020,
	NEEDS_SHIP_DATE: -18010022,
	// Tracking-number / carrier problems.
	INVALID_PARAM: -18010011,
	INVALID_FORMAT: -18010012,
	INVALID_DATA: -18010013,
	ALREADY_REGISTERED: -18019901,
	NOT_REGISTERED: -18019902,
	CARRIER_NOT_DETECTED: -18019903,
	NO_TRACKING_INFO: -18019909,
	WRONG_CARRIER: -18019910,
	CARRIER_UNREGISTRABLE: -18019911,
} as const;

/**
 * Delays between gettrackinfo polls after a fresh register. 17TRACK returns
 * results "within seconds" but warns it can exceed 5 minutes on carrier issues,
 * so we back off and return a pending result rather than hold the request open.
 */
const POLL_DELAYS_MS = [1_500, 2_500, 4_000, 6_000];

export interface TrackParams {
	number: string;
	/** Numeric 17TRACK carrier code. Optional — omitted means auto-detect. */
	carrier?: number;
	destinationPostalCode?: string;
	destinationCountry?: string;
	/** YYYY-MM-DD (converted to 17TRACK's YYYY/MM/DD on the wire). */
	shipDate?: string;
	phone?: string;
	/** Brazilian CPF/CNPJ, required by some BR carriers. */
	cpfOrCnpj?: string;
}

// --- 17TRACK wire types (only the fields we consume) ---

interface Track17Address {
	country?: string | null;
	state?: string | null;
	city?: string | null;
	postal_code?: string | null;
}

interface Track17Event {
	time_iso?: string | null;
	time_utc?: string | null;
	description?: string | null;
	description_translation?: { lang?: string | null; description?: string | null } | null;
	location?: string | null;
	stage?: string | null;
	sub_status?: string | null;
	address?: Track17Address | null;
}

interface Track17Milestone {
	key_stage?: string | null;
	time_iso?: string | null;
	time_utc?: string | null;
}

interface Track17Provider {
	provider?: {
		key?: number | null;
		name?: string | null;
		homepage?: string | null;
		country?: string | null;
	} | null;
	service_type?: string | null;
	provider_tips?: string | null;
	events?: Track17Event[] | null;
}

interface Track17Info {
	shipping_info?: {
		shipper_address?: Track17Address | null;
		recipient_address?: Track17Address | null;
	} | null;
	latest_status?: {
		status?: string | null;
		sub_status?: string | null;
		sub_status_descr?: string | null;
	} | null;
	latest_event?: Track17Event | null;
	time_metrics?: {
		days_of_transit?: number | null;
		days_after_last_update?: number | null;
		estimated_delivery_date?: {
			source?: string | null;
			from?: string | null;
			to?: string | null;
		} | null;
	} | null;
	milestone?: Track17Milestone[] | null;
	misc_info?: {
		service_type?: string | null;
		weight_kg?: string | null;
		local_provider?: string | null;
		local_key?: number | null;
	} | null;
	tracking?: { providers?: Track17Provider[] | null } | null;
}

interface Track17Accepted {
	number: string;
	carrier?: number | null;
	track_info?: Track17Info | null;
}

interface Track17Error {
	code?: number | null;
	message?: string | null;
}

interface Track17Rejected {
	number?: string;
	/** 17TRACK returns this as an int on some endpoints and a string on others. */
	carrier?: number | string | null;
	error?: Track17Error | null;
}

interface Track17Response {
	code: number;
	data?: {
		accepted?: Track17Accepted[] | null;
		rejected?: Track17Rejected[] | null;
		/** Populated instead of accepted/rejected when the whole payload is invalid. */
		errors?: Track17Error[] | null;
	} | null;
}

// --- Errors ---

type ApiErrorLike = Error & { status: number; code: string };

function apiError(status: number, code: string, message: string): ApiErrorLike {
	const err = new Error(message) as ApiErrorLike;
	err.status = status;
	err.code = code;
	return err;
}

const UPSTREAM_UNAVAILABLE = () =>
	apiError(503, "TRACKING_UNAVAILABLE", "Tracking provider is temporarily unavailable.");

/**
 * Maps a 17TRACK error code onto an HTTP-shaped error.
 *
 * The `-1801001{8,9,20,22}` family is the important one for a public endpoint:
 * the carrier needs an extra field, and 17TRACK's message names which. We pass
 * that message through so the caller knows exactly what to add and retry with.
 */
function toApiError(number: string, error: Track17Error | null | undefined): ApiErrorLike {
	const code = error?.code;
	const detail = error?.message ?? undefined;

	switch (code) {
		case CODE.NEEDS_POSTAL_CODE:
		case CODE.NEEDS_COUNTRY_AND_POSTAL_CODE:
			return apiError(
				422,
				"ADDITIONAL_FIELD_REQUIRED",
				detail ??
					`This carrier requires a destination postal code. Retry with "destinationPostalCode".`,
			);
		case CODE.NEEDS_PHONE:
			return apiError(
				422,
				"ADDITIONAL_FIELD_REQUIRED",
				detail ?? `This carrier requires a phone number. Retry with "phone".`,
			);
		case CODE.NEEDS_SHIP_DATE:
			return apiError(
				422,
				"ADDITIONAL_FIELD_REQUIRED",
				detail ?? `This carrier requires a ship date. Retry with "shipDate" (YYYY-MM-DD).`,
			);
		case CODE.CARRIER_NOT_DETECTED:
			return apiError(
				422,
				"CARRIER_NOT_DETECTED",
				`Could not determine a carrier for "${number}". Retry with an explicit "carrier" code from https://res.17track.net/asset/carrier/info/apicarrier.all.json`,
			);
		case CODE.WRONG_CARRIER:
			return apiError(
				422,
				"INVALID_CARRIER",
				detail ?? `The supplied carrier code is not valid for "${number}".`,
			);
		case CODE.CARRIER_UNREGISTRABLE:
			return apiError(
				503,
				"CARRIER_UNAVAILABLE",
				detail ?? "This carrier cannot be tracked at the moment. Try again later.",
			);
		case CODE.NO_TRACKING_INFO:
			return apiError(
				404,
				"NO_TRACKING_INFO",
				detail ?? "No tracking information is available yet.",
			);
		case CODE.INVALID_PARAM:
		case CODE.INVALID_FORMAT:
		case CODE.INVALID_DATA:
			return apiError(
				400,
				"INVALID_TRACKING_NUMBER",
				detail ?? `"${number}" is not a valid tracking number.`,
			);
		// Our account, our problem — never leak the cause to the caller.
		case CODE.QUOTA_EXHAUSTED:
		case CODE.DAILY_LIMIT:
		case CODE.IP_NOT_WHITELISTED:
		case CODE.INVALID_KEY:
		case CODE.ACCOUNT_DISABLED:
		case CODE.UNAUTHORIZED:
		case CODE.INTERNAL:
			return UPSTREAM_UNAVAILABLE();
		default:
			return apiError(
				502,
				"TRACKING_PROVIDER_ERROR",
				detail ?? "Tracking provider rejected the request.",
			);
	}
}

// --- HTTP ---

async function call(path: "register" | "gettrackinfo", body: unknown): Promise<Track17Response> {
	const res = await fetch(`${BASE_URL}/${path}`, {
		method: "POST",
		headers: {
			"17token": env.TRACK17_API_KEY,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	// 401 means our key or IP whitelist is wrong; 429 means we exceeded 3 req/s.
	// Both are ours to fix, so they surface as 503 rather than blaming the caller.
	if (!res.ok) {
		if (res.status === 401 || res.status === 429 || res.status === 503) {
			throw UPSTREAM_UNAVAILABLE();
		}
		throw apiError(502, "TRACKING_PROVIDER_ERROR", `Tracking provider returned ${res.status}.`);
	}

	const json = (await res.json()) as Track17Response;

	// A malformed payload comes back as data.errors[] with no accepted/rejected.
	const topLevel = json.data?.errors?.[0];
	if (topLevel) {
		throw toApiError("", topLevel);
	}

	return json;
}

/**
 * gettrackinfo accepts only `number` and `carrier` — passing register-only fields
 * risks a -18010013 "submitted data is invalid". Registration carries the rest.
 */
function readPayload(params: TrackParams) {
	return [
		{
			number: params.number,
			...(params.carrier !== undefined ? { carrier: params.carrier } : {}),
		},
	];
}

function registerPayload(params: TrackParams) {
	return [
		{
			number: params.number,
			...(params.carrier !== undefined ? { carrier: params.carrier } : {}),
			...(params.destinationPostalCode
				? { destination_postal_code: params.destinationPostalCode }
				: {}),
			...(params.destinationCountry ? { destination_country: params.destinationCountry } : {}),
			// 17TRACK expects YYYY/MM/DD here, not the ISO form we accept from callers.
			...(params.shipDate ? { ship_date: params.shipDate.replace(/-/g, "/") } : {}),
			...(params.phone ? { phone_number: params.phone } : {}),
			...(params.cpfOrCnpj ? { cpf_or_cnpj: params.cpfOrCnpj } : {}),
			// Default translation_mode ("UseDefaultLang") is free; "UseThirdPartyServices"
			// would burn an extra quota per number per language, so we never set it.
			lang: "en",
		},
	];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Normalization ---

function joinAddress(address?: Track17Address | null): string | null {
	if (!address) return null;
	const parts = [address.city, address.state, address.country].filter(Boolean);
	return parts.length > 0 ? parts.join(", ") : null;
}

function normalizeEvent(event: Track17Event): TrackingEvent {
	return {
		time: event.time_iso ?? event.time_utc ?? null,
		// Prefer the translated description when the carrier or 17TRACK supplied one.
		description: event.description_translation?.description ?? event.description ?? null,
		location: event.location ?? joinAddress(event.address),
		stage: event.stage ?? null,
	};
}

/** Guards against an unrecognized status leaking through if 17TRACK adds one. */
function toStatus(raw: string | null | undefined): TrackStatus {
	return TRACK_STATUSES.includes(raw as TrackStatus) ? (raw as TrackStatus) : "NotFound";
}

/**
 * Postal shipments return the same journey twice — once per provider — so events
 * are deduped on time + description, which the docs call out as duplicated.
 */
function collectEvents(providers: Track17Provider[]): TrackingEvent[] {
	const seen = new Set<string>();
	const events: TrackingEvent[] = [];

	for (const event of providers.flatMap((p) => p?.events ?? [])) {
		if (!event) continue;
		const normalized = normalizeEvent(event);
		const key = `${normalized.time ?? ""}|${normalized.description ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);
		events.push(normalized);
	}

	return events.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""));
}

function collectMilestones(raw: Track17Milestone[]): TrackMilestone[] {
	const reached = raw
		.filter((m) => m?.key_stage && (m.time_iso || m.time_utc))
		.map((m) => ({ stage: m.key_stage as string, time: m.time_iso ?? m.time_utc ?? null }));

	// Return in canonical shipping order rather than however the carrier listed them.
	return reached.sort((a, b) => {
		const ai = TRACK_MILESTONE_STAGES.indexOf(a.stage as (typeof TRACK_MILESTONE_STAGES)[number]);
		const bi = TRACK_MILESTONE_STAGES.indexOf(b.stage as (typeof TRACK_MILESTONE_STAGES)[number]);
		return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
	});
}

function trackingPageUrl(number: string): string {
	return `https://t.17track.net/en#nums=${encodeURIComponent(number)}`;
}

function normalize(number: string, accepted: Track17Accepted): TrackResult {
	const info = accepted.track_info ?? {};
	const providers = (info.tracking?.providers ?? []).filter(Boolean) as Track17Provider[];

	// providers[0] is the destination carrier on postal handoffs, so prefer the
	// provider matching the registered carrier code for the headline carrier.
	const primary =
		providers.find((p) => p.provider?.key === accepted.carrier)?.provider ??
		providers[0]?.provider ??
		null;

	const status = toStatus(info.latest_status?.status);
	const milestones = collectMilestones(info.milestone ?? []);
	const stageTime = (stage: string) => milestones.find((m) => m.stage === stage)?.time ?? null;
	const estimated = info.time_metrics?.estimated_delivery_date ?? null;
	const localKey = info.misc_info?.local_key ?? null;

	return {
		number,
		status,
		subStatus: info.latest_status?.sub_status ?? null,
		statusDescription: info.latest_status?.sub_status_descr ?? null,
		delivered: status === "Delivered",
		found: status !== "NotFound",
		carrier: {
			code: accepted.carrier ?? primary?.key ?? null,
			name: primary?.name ?? null,
			homepage: primary?.homepage ?? null,
			country: primary?.country ?? null,
		},
		lastMileCarrier:
			localKey && localKey !== accepted.carrier
				? { code: localKey, name: info.misc_info?.local_provider ?? null }
				: null,
		origin: info.shipping_info?.shipper_address?.country ?? null,
		destination: info.shipping_info?.recipient_address?.country ?? null,
		latestEvent: info.latest_event ? normalizeEvent(info.latest_event) : null,
		events: collectEvents(providers),
		milestones,
		pickedUpAt: stageTime("PickedUp"),
		deliveredAt: stageTime("Delivered"),
		daysInTransit: info.time_metrics?.days_of_transit ?? null,
		daysSinceLastUpdate: info.time_metrics?.days_after_last_update ?? null,
		estimatedDelivery:
			estimated?.from || estimated?.to
				? {
						from: estimated.from ?? null,
						to: estimated.to ?? null,
						source: estimated.source ?? null,
					}
				: null,
		serviceType: info.misc_info?.service_type ?? providers[0]?.service_type ?? null,
		weightKg: info.misc_info?.weight_kg ?? null,
		carrierNotice: providers.find((p) => p.provider_tips)?.provider_tips ?? null,
		trackingPageUrl: trackingPageUrl(number),
	};
}

/**
 * Returned when the number is registered but no carrier data has arrived yet.
 * Status is NotFound rather than InfoReceived — we have no evidence the carrier
 * received anything, and NotFound is exactly "inquiry made, nothing found".
 */
function notYetSynced(params: TrackParams, carrier: number | null): TrackResult {
	return {
		number: params.number,
		status: "NotFound",
		subStatus: null,
		statusDescription: null,
		delivered: false,
		found: false,
		carrier: { code: carrier, name: null, homepage: null, country: null },
		lastMileCarrier: null,
		origin: null,
		destination: null,
		latestEvent: null,
		events: [],
		milestones: [],
		pickedUpAt: null,
		deliveredAt: null,
		daysInTransit: null,
		daysSinceLastUpdate: null,
		estimatedDelivery: null,
		serviceType: null,
		weightKg: null,
		carrierNotice: null,
		trackingPageUrl: trackingPageUrl(params.number),
	};
}

// --- Public API ---

export interface TrackOutcome {
	result: TrackResult;
	/** True when this lookup registered a new number and consumed 1 17TRACK quota. */
	quotaSpent: boolean;
}

/**
 * Resolves shipment status for a tracking number.
 *
 * `carrier` is optional: 17TRACK auto-detects from the number's format for most
 * UPU and commercial carriers. Supply it only for ambiguous formats, or after a
 * `CARRIER_NOT_DETECTED` response.
 *
 * Reads are attempted first — a number already under automatic tracking costs no
 * quota. Only a first-time number is registered (1 quota) and then polled until
 * the initial carrier sync lands.
 */
export async function track(params: TrackParams): Promise<TrackOutcome> {
	const first = await call("gettrackinfo", readPayload(params));

	const accepted = first.data?.accepted?.[0];
	if (accepted?.track_info) {
		return { result: normalize(params.number, accepted), quotaSpent: false };
	}

	const rejected = first.data?.rejected?.[0];
	if (rejected && rejected.error?.code !== CODE.NOT_REGISTERED) {
		throw toApiError(params.number, rejected.error);
	}

	// Not registered yet — register (consumes 1 quota) then wait for the first sync.
	const registration = await call("register", registerPayload(params));
	const registerRejected = registration.data?.rejected?.[0];
	if (registerRejected && registerRejected.error?.code !== CODE.ALREADY_REGISTERED) {
		throw toApiError(params.number, registerRejected.error);
	}

	// An entry in accepted[] means 17TRACK charged us a shipment ("one shipment will
	// be charged upon successful registration"). ALREADY_REGISTERED does not charge.
	const registered = registration.data?.accepted?.[0];
	const quotaSpent = Boolean(registered);

	// register echoes the carrier it resolved (or corrected to) — reuse it so the
	// follow-up reads target one carrier instead of every possible match.
	const resolvedCarrier = registered?.carrier ?? params.carrier ?? null;
	const pollParams: TrackParams =
		resolvedCarrier !== null ? { ...params, carrier: resolvedCarrier } : params;

	// Past this point quota may already be spent. The x402 middleware skips
	// settlement on any >=400 response, so throwing here would mean paying 17TRACK
	// and collecting nothing — every exit below must be a successful result.
	let last: TrackResult | null = null;
	try {
		for (const delay of POLL_DELAYS_MS) {
			await sleep(delay);
			const polled = await call("gettrackinfo", readPayload(pollParams));
			const polledAccepted = polled.data?.accepted?.[0];
			if (!polledAccepted?.track_info) continue;

			last = normalize(params.number, polledAccepted);
			if (last.found) return { result: last, quotaSpent };
			// 17TRACK has decided the number itself is bad — more polling won't help.
			if (last.subStatus === "NotFound_InvalidCode") return { result: last, quotaSpent };
		}
	} catch (error) {
		// Nothing was charged, so the caller can retry for free — surface the error.
		if (!quotaSpent) throw error;
		console.warn(
			`[TRACK] Poll failed after a charged registration for ${params.number}; returning partial result:`,
			error,
		);
	}

	// Registered but the carrier has not reported yet. The number stays under
	// automatic tracking, so a follow-up request costs no additional quota.
	return { result: last ?? notYetSynced(params, resolvedCarrier), quotaSpent };
}
