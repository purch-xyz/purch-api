import { createFacilitatorConfig } from "@coinbase/x402";
import type { RoutesConfig } from "@x402/core/server";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { paymentMiddleware } from "@x402/hono";
import { SOLANA_MAINNET_CAIP2 } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import type { Context } from "hono";
import { env } from "../config/env.js";
import { DYNAMIC_ROUTE_CONFIG, PAYABLE_ROUTES, type PayableRoute, USDC_MINT } from "./config.js";

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
 * Build a valid x402 v2 402 response for probe handlers.
 * x402scan validates: accepts[].amount, accepts[].asset, resource (object).
 */
export function handle402Probe(c: Context, route: PayableRoute) {
	const amountMicroUsdc = Math.round(Number.parseFloat(route.price) * 1_000_000).toString();
	return c.json(
		{
			x402Version: 2,
			error: "Payment required",
			resource: {
				url: c.req.url,
				description: route.description,
				mimeType: "application/json",
			},
			accepts: [
				{
					scheme: "exact",
					network: SOLANA_MAINNET_CAIP2,
					amount: amountMicroUsdc,
					asset: USDC_MINT,
					payTo: env.X402_PAYTO_ADDRESS,
					maxTimeoutSeconds: 60,
				},
			],
			extensions: {
				...declareDiscoveryExtension(route.bazaar),
			},
		},
		402,
	);
}

/**
 * Build a valid x402 v2 402 probe response for dynamic-priced (quote) routes.
 * Uses a nominal $0.01 amount since actual price requires a request body.
 */
export function handleDynamic402Probe(c: Context, routeKey: string) {
	const config = DYNAMIC_ROUTE_CONFIG[routeKey];
	return c.json(
		{
			x402Version: 2,
			error: "Payment required",
			resource: {
				url: c.req.url,
				description: `${config.description}. Send a POST with a body to get the exact price.`,
				mimeType: "application/json",
			},
			accepts: [
				{
					scheme: "exact",
					network: SOLANA_MAINNET_CAIP2,
					amount: "10000", // nominal $0.01 — actual price is dynamic
					asset: USDC_MINT,
					payTo: env.X402_PAYTO_ADDRESS,
					maxTimeoutSeconds: config.maxTimeoutSeconds,
				},
			],
			extensions: {
				...declareDiscoveryExtension(config.bazaar),
			},
		},
		402,
	);
}
