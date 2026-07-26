import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { getClientIP } from "../middleware/rateLimit.js";
import { ApiErrorSchema, PaymentRequiredSchema } from "../schemas/common.js";
import { TrackQuerySchema, TrackResponseSchema } from "../schemas/track.js";
import { notifyTrackFailure, notifyTrackLookup } from "../services/slack.js";
import { track } from "../services/track17.js";
import { TRACK_PRICE_USD } from "../x402/config.js";

export const x402TrackRouter = new OpenAPIHono();

const trackRoute = createRoute({
	method: "get",
	path: "/",
	tags: ["Track"],
	summary: "Track a shipment",
	description:
		"Look up live shipment status for any tracking number across 3,400+ carriers (UPS, USPS, FedEx, DHL, Royal Mail, China Post, Cainiao, and most regional/cross-border couriers). " +
		"**Only `number` is required** — the carrier is auto-detected from the number format. " +
		"Returns a normalized status, milestone timeline, and the full event history newest-first. Works with any tracking number; it does not have to be a Purch order.\n\n" +
		"Freshness: the carrier is re-polled every 6–12 hours (24h once delivered), so check `daysSinceLastUpdate` to judge staleness.",
	request: {
		query: TrackQuerySchema,
	},
	responses: {
		200: {
			description: "Shipment status",
			content: { "application/json": { schema: TrackResponseSchema } },
		},
		400: {
			description: "Invalid tracking number",
			content: { "application/json": { schema: ApiErrorSchema } },
		},
		402: {
			description: "Payment Required",
			content: { "application/json": { schema: PaymentRequiredSchema } },
		},
		404: {
			description: "No tracking information available for this number yet",
			content: { "application/json": { schema: ApiErrorSchema } },
		},
		422: {
			description:
				"`CARRIER_NOT_DETECTED` — retry with an explicit `carrier`; or `ADDITIONAL_FIELD_REQUIRED` — the carrier needs a postal code, phone, or ship date (the message names which)",
			content: { "application/json": { schema: ApiErrorSchema } },
		},
		502: {
			description: "Tracking provider error",
			content: { "application/json": { schema: ApiErrorSchema } },
		},
		503: {
			description: "Tracking provider unavailable",
			content: { "application/json": { schema: ApiErrorSchema } },
		},
	},
});

x402TrackRouter.openapi(trackRoute, async (c) => {
	const query = c.req.valid("query");
	const ip = getClientIP(c);

	let outcome: Awaited<ReturnType<typeof track>>;
	try {
		outcome = await track(query);
	} catch (error) {
		const failure = error as Error & { code?: string };
		notifyTrackFailure({
			number: query.number,
			code: failure.code ?? "UNKNOWN",
			message: failure.message,
			ip,
		});
		throw error;
	}

	const { result, quotaSpent } = outcome;

	notifyTrackLookup({
		number: result.number,
		status: result.status,
		subStatus: result.subStatus,
		carrierName: result.carrier.name,
		carrierCode: result.carrier.code,
		found: result.found,
		quotaSpent,
		priceUsd: TRACK_PRICE_USD,
		ip,
	});

	return c.json(result, 200);
});
