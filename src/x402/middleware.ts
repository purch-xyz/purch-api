import { createFacilitatorConfig } from "@coinbase/x402";
import type { RoutesConfig } from "@x402/core/server";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { paymentMiddleware } from "@x402/hono";
import { SOLANA_MAINNET_CAIP2 } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import type { Context } from "hono";
import { env } from "../config/env.js";
import { DYNAMIC_ROUTE_CONFIG, PAYABLE_ROUTES, type PayableRoute } from "./config.js";

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

// --- Build combined route config (static + dynamic) ---

function buildRouteConfig(): RoutesConfig {
	// biome-ignore lint/suspicious/noExplicitAny: x402 RoutesConfig accepts both static and dynamic price fields
	const routes: Record<string, any> = {};

	// Static routes (fixed price string)
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
			extensions: {
				...declareDiscoveryExtension(route.bazaar),
			},
		};
	}

	// Dynamic routes (price is an async function)
	for (const [key, config] of Object.entries(DYNAMIC_ROUTE_CONFIG)) {
		routes[key] = {
			accepts: [config.accepts],
			description: config.description,
			mimeType: config.mimeType,
			maxTimeoutSeconds: config.maxTimeoutSeconds,
			extensions: {
				...declareDiscoveryExtension(config.bazaar),
			},
		};
	}

	return routes;
}

/**
 * Official x402 payment middleware with Coinbase facilitator.
 * Supports both static pricing (search, shop) and dynamic pricing (buy, vault/buy).
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

/**
 * Build a 402 probe response for dynamic-priced POST routes.
 * Returns a generic "price varies" response since we can't compute without a body.
 */
export function handleDynamic402Probe(c: Context, description: string) {
	return c.json(
		{
			x402Version: 2,
			error: "Payment required",
			description: `${description}. Send a POST request with a body to get the exact price.`,
			accepts: [
				{
					scheme: "exact",
					network: SOLANA_MAINNET_CAIP2,
					resource: c.req.url,
					description,
					mimeType: "application/json",
					maxTimeoutSeconds: 120,
					payTo: env.X402_PAYTO_ADDRESS,
				},
			],
		},
		402,
	);
}
