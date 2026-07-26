import { env } from "../config/env.js";

/**
 * Posts to the configured Slack webhook. No-ops when unconfigured, and never
 * throws — a notification failure must not affect a paid API response.
 */
async function post(text: string): Promise<void> {
	if (!env.SLACK_WEBHOOK_URL) return;

	try {
		const res = await fetch(env.SLACK_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text }),
		});
		if (!res.ok) {
			console.warn(`[SLACK] Webhook returned ${res.status}`);
		}
	} catch (error) {
		console.warn("[SLACK] Error sending notification:", error);
	}
}

/** Fire-and-forget so Slack latency never lands on the caller's request. */
export function notify(text: string): void {
	void post(text);
}

export interface TrackNotification {
	number: string;
	status: string;
	subStatus: string | null;
	carrierName: string | null;
	carrierCode: number | null;
	found: boolean;
	/** True when this lookup registered a new number and consumed 17TRACK quota. */
	quotaSpent: boolean;
	priceUsd: string;
	ip: string;
}

export function notifyTrackLookup(params: TrackNotification): void {
	const carrier = params.carrierName
		? `${params.carrierName}${params.carrierCode ? ` (${params.carrierCode})` : ""}`
		: (params.carrierCode?.toString() ?? "unknown");
	const status = params.found
		? `${params.status}${params.subStatus ? ` / ${params.subStatus}` : ""}`
		: `${params.status} (no carrier data yet)`;

	notify(
		[
			"📦 *X402 TRACK*",
			`Number: \`${params.number}\``,
			`Carrier: ${carrier}`,
			`Status: ${status}`,
			`Revenue: $${params.priceUsd} · 17TRACK quota: ${params.quotaSpent ? "1 (new registration)" : "0 (already tracked)"}`,
			`IP: ${params.ip}`,
		].join("\n"),
	);
}

export interface TrackFailureNotification {
	number: string;
	code: string;
	message: string;
	ip: string;
}

export function notifyTrackFailure(params: TrackFailureNotification): void {
	notify(
		[
			"⚠️ *X402 TRACK FAILED*",
			`Number: \`${params.number}\``,
			`Error: ${params.code} — ${params.message}`,
			`IP: ${params.ip}`,
		].join("\n"),
	);
}
