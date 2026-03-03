import type { Context, Next } from "hono";
import { env } from "../config/env.js";
import { USDC_MINT, type PayableRoute } from "./config.js";

function priceToBaseUnits(price: string): string {
	const amount = Number.parseFloat(price);
	return Math.round(amount * 1_000_000).toString();
}

function getFullUrl(c: Context): string {
	const proto = c.req.header("x-forwarded-proto") || "https";
	const host = c.req.header("host") || "api.purch.xyz";
	return `${proto}://${host}${c.req.path}`;
}

function build402Response(c: Context, route: PayableRoute) {
	return c.json(
		{
			x402Version: 1,
			error: "X-PAYMENT header is required",
			accepts: [
				{
					scheme: "exact",
					network: "solana",
					maxAmountRequired: priceToBaseUnits(route.price),
					resource: getFullUrl(c),
					description: route.description,
					mimeType: "application/json",
					maxTimeoutSeconds: 60,
					asset: USDC_MINT,
					payTo: env.X402_PAYTO_ADDRESS,
					extra: {},
					outputSchema: {
						input: route.inputSchema,
					},
				},
			],
		},
		402,
	);
}

/**
 * x402 middleware factory.
 * Returns 402 Payment Required with accepts array when no X-PAYMENT header is present.
 */
export function x402PayableMiddleware(route: PayableRoute) {
	return async (c: Context, next: Next) => {
		const payment = c.req.header("X-PAYMENT");
		if (!payment) {
			return build402Response(c, route);
		}
		await next();
	};
}

/**
 * Build a 402 response for GET probe handlers on POST-only routes.
 */
export function handle402Probe(c: Context, route: PayableRoute) {
	return build402Response(c, route);
}
