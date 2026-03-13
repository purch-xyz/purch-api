import { SOLANA_MAINNET_CAIP2 } from "@x402/svm";
import { env } from "../config/env.js";
import { purchClient } from "../services/purch.js";
import type { ShippingAddress } from "../types/index.js";
import {
	getCachedOrder,
	getCachedVaultItem,
	hashBody,
	setCachedOrder,
	setCachedVaultItem,
} from "./order-cache.js";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface SchemaField {
	type: string;
	description: string;
	required?: boolean;
}

interface InputSchema {
	type: "http";
	method: "GET" | "POST";
	bodyFields?: Record<string, SchemaField>;
	queryFields?: Record<string, SchemaField>;
}

export interface PayableRoute {
	path: string;
	method: "GET" | "POST";
	price: string;
	description: string;
	inputSchema: InputSchema;
}

/**
 * Routes with static (fixed) x402 pricing.
 */
export const PAYABLE_ROUTES: PayableRoute[] = [
	{
		path: "/x402/shop",
		method: "POST",
		price: "0.10",
		description: "AI-powered product search",
		inputSchema: {
			type: "http",
			method: "POST",
			bodyFields: {
				message: {
					type: "string",
					description: "Natural language product search query",
					required: true,
				},
				context: {
					type: "object",
					description: "Optional context with priceRange and preferences",
				},
			},
		},
	},
	{
		path: "/x402/search",
		method: "GET",
		price: "0.01",
		description: "Product search with filters",
		inputSchema: {
			type: "http",
			method: "GET",
			queryFields: {
				q: { type: "string", description: "Search query", required: true },
				priceMin: { type: "number", description: "Minimum price filter" },
				priceMax: { type: "number", description: "Maximum price filter" },
				brand: { type: "string", description: "Filter by brand" },
				page: { type: "integer", description: "Page number for pagination" },
			},
		},
	},
	{
		path: "/x402/vault/search",
		method: "GET",
		price: "0.01",
		description: "Search vault items (skills, knowledge, personas)",
		inputSchema: {
			type: "http",
			method: "GET",
			queryFields: {
				q: { type: "string", description: "Search query" },
				category: {
					type: "string",
					description:
						"Filter by category: marketing, development, automation, career, ios, productivity",
				},
				productType: { type: "string", description: "Filter by type: skill, knowledge, persona" },
				minPrice: { type: "integer", description: "Minimum price in USDC (whole units)" },
				maxPrice: { type: "integer", description: "Maximum price in USDC (whole units)" },
				cursor: { type: "string", description: "Pagination cursor (UUID)" },
				limit: { type: "integer", description: "Items per page (1-100, default 30)" },
			},
		},
	},
	{
		path: "/x402/vault/download",
		method: "GET",
		price: "0.01",
		description:
			"Download purchased vault item file. URL: /x402/vault/download/:purchaseId?downloadToken=...&txSignature=...",
		inputSchema: {
			type: "http",
			method: "GET",
			queryFields: {
				purchaseId: {
					type: "string",
					description: "Purchase ID (UUID) — passed as a path parameter in the URL",
					required: true,
				},
				downloadToken: {
					type: "string",
					description: "Secret download token received from the buy response",
					required: true,
				},
				txSignature: {
					type: "string",
					description:
						"On-chain transaction signature. Required for first download, optional for re-downloads.",
				},
			},
		},
	},
];

/**
 * Dynamic price function for /x402/buy.
 * Creates a Crossmint order with the treasury wallet as payer,
 * caches the result, and returns the product price.
 */
async function getBuyPrice(context: {
	adapter: { getBody: () => Promise<unknown> };
}): Promise<string> {
	const body = await context.adapter.getBody();
	if (!body || typeof body !== "object") {
		return "$0.01"; // fallback for malformed requests (will fail validation later)
	}

	const bodyHash = hashBody(body);
	const cached = getCachedOrder(bodyHash);
	if (cached) {
		return `$${cached.totalPrice}`;
	}

	const typedBody = body as {
		productUrl?: string;
		asin?: string;
		shippingAddress: ShippingAddress;
		email: string;
		walletAddress?: string;
		variantId?: string;
	};

	// Create order on backend with treasury wallet as payer
	const result = await purchClient.buy({
		productUrl: typedBody.productUrl,
		asin: typedBody.asin,
		shippingAddress: typedBody.shippingAddress,
		email: typedBody.email,
		walletAddress: env.ORDER_TREASURY_WALLET,
		variantId: typedBody.variantId,
	});

	setCachedOrder(bodyHash, {
		orderId: result.orderId,
		totalPrice: result.totalPrice.amount,
		product: result.product,
	});

	return `$${result.totalPrice.amount}`;
}

/**
 * Dynamic price function for /x402/vault/buy.
 * Looks up the vault item price from the backend.
 */
async function getVaultBuyPrice(context: {
	adapter: { getBody: () => Promise<unknown> };
}): Promise<string> {
	const body = await context.adapter.getBody();
	if (!body || typeof body !== "object") {
		return "$0.01";
	}

	const bodyHash = hashBody(body);
	const cached = getCachedVaultItem(bodyHash);
	if (cached) {
		return `$${cached.price}`;
	}

	const typedBody = body as { slug?: string };
	if (!typedBody.slug) {
		return "$0.01";
	}

	// Search for the vault item to get its price
	const searchResult = await purchClient.vaultSearch({ search: typedBody.slug, limit: 1 });
	const item = searchResult.items.find((i) => i.slug === typedBody.slug);

	if (!item) {
		return "$0.01"; // will fail in handler
	}

	setCachedVaultItem(bodyHash, {
		slug: item.slug,
		price: item.price,
		title: item.title,
		productType: item.productType,
	});

	return `$${item.price}`;
}

/**
 * Dynamic x402 route configurations.
 * Price is determined per-request based on the product/item being purchased.
 */
export const DYNAMIC_ROUTE_CONFIG: Record<
	string,
	{
		accepts: {
			scheme: string;
			price: (context: { adapter: { getBody: () => Promise<unknown> } }) => Promise<string>;
			network: string;
			payTo: string;
		};
		description: string;
		mimeType: string;
		maxTimeoutSeconds: number;
	}
> = {
	"POST /x402/buy": {
		accepts: {
			scheme: "exact",
			price: getBuyPrice,
			network: SOLANA_MAINNET_CAIP2,
			payTo: env.X402_PAYTO_ADDRESS,
		},
		description: "Purchase a product — price equals the product total (dynamic)",
		mimeType: "application/json",
		maxTimeoutSeconds: 120,
	},
	"POST /x402/vault/buy": {
		accepts: {
			scheme: "exact",
			price: getVaultBuyPrice,
			network: SOLANA_MAINNET_CAIP2,
			payTo: env.X402_PAYTO_ADDRESS,
		},
		description: "Purchase a vault item — price equals the item price (dynamic)",
		mimeType: "application/json",
		maxTimeoutSeconds: 120,
	},
};
