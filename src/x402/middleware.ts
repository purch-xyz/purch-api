import { createFacilitatorConfig } from "@coinbase/x402";
import type { RoutesConfig } from "@x402/core/server";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { paymentMiddleware } from "@x402/hono";
import { SOLANA_MAINNET_CAIP2 } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import type { Context } from "hono";
import { env } from "../config/env.js";
import { PAYABLE_ROUTES, type PayableRoute } from "./config.js";

// --- Facilitator setup ---

const facilitatorConfig = createFacilitatorConfig(
	env.X402_CDP_API_KEY_ID,
	env.X402_CDP_API_KEY_SECRET,
);

const facilitatorClient = new HTTPFacilitatorClient(facilitatorConfig);

const resourceServer = new x402ResourceServer(facilitatorClient).register(
	SOLANA_MAINNET_CAIP2,
	new ExactSvmScheme(),
);

// --- Build route config from PAYABLE_ROUTES ---

function buildRouteConfig() {
	const routes: Record<
		string,
		{
			accepts: Array<{
				scheme: string;
				price: string;
				network: string;
				payTo: string;
			}>;
			description: string;
			mimeType: string;
			maxTimeoutSeconds: number;
		}
	> = {};

	for (const route of PAYABLE_ROUTES) {
		const key = `${route.method} ${route.path}`;
		routes[key] = {
			accepts: [
				{
					scheme: "exact",
					price: `$${route.price}`,
					network: SOLANA_MAINNET_CAIP2,
					payTo: env.X402_PAYTO_ADDRESS,
				},
			],
			description: route.description,
			mimeType: "application/json",
			maxTimeoutSeconds: 60,
		};
	}

	return routes as RoutesConfig;
}

/**
 * Official x402 payment middleware with Coinbase facilitator.
 * Verifies payments and settles on-chain.
 */
export const x402Middleware = paymentMiddleware(buildRouteConfig(), resourceServer);

/**
 * Build a 402 response for GET probe handlers on POST-only routes.
 * (x402scan probes both GET and POST — this handles GET on POST-only endpoints)
 */
export function handle402Probe(c: Context, route: PayableRoute) {
	return c.json(
		{
			x402Version: 2,
			error: "Payment required",
			accepts: [
				{
					scheme: "exact",
					network: SOLANA_MAINNET_CAIP2,
					maxAmountRequired: Math.round(Number.parseFloat(route.price) * 1_000_000).toString(),
					resource: c.req.url,
					description: route.description,
					mimeType: "application/json",
					maxTimeoutSeconds: 60,
					payTo: env.X402_PAYTO_ADDRESS,
				},
			],
		},
		402,
	);
}
