import type { DeclareDiscoveryExtensionInput } from "@x402/extensions/bazaar";
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

/**
 * Price of a shipment lookup. 17TRACK bills ~$0.024 per new tracking number
 * (entry quota pack), plus $0.50 margin.
 */
export const TRACK_PRICE_USD = "0.52";

export interface PayableRoute {
	path: string;
	method: "GET" | "POST";
	price: string;
	description: string;
	bazaar: DeclareDiscoveryExtensionInput;
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
		bazaar: {
			input: { message: "I need comfortable running shoes under $150 with good arch support" },
			inputSchema: {
				properties: {
					message: { type: "string", description: "Natural language product search query" },
					context: {
						type: "object",
						description: "Optional context with priceRange and preferences",
						properties: {
							priceRange: {
								type: "object",
								properties: { min: { type: "number" }, max: { type: "number" } },
							},
							preferences: { type: "array", items: { type: "string" } },
						},
					},
				},
				required: ["message"],
			},
			bodyType: "json",
			output: {
				example: {
					reply: "Here are some great running shoes...",
					products: [
						{
							asin: "B0CXYZ1234",
							title: "Running Shoes",
							price: 129.99,
							currency: "USD",
							source: "amazon",
						},
					],
				},
			},
		},
	},
	{
		path: "/x402/search",
		method: "GET",
		price: "0.01",
		description: "Product search with filters",
		bazaar: {
			input: { q: "wireless headphones" },
			inputSchema: {
				properties: {
					q: { type: "string", description: "Search query" },
					priceMin: { type: "number", description: "Minimum price filter" },
					priceMax: { type: "number", description: "Maximum price filter" },
					brand: { type: "string", description: "Filter by brand" },
					page: { type: "integer", description: "Page number for pagination" },
				},
				required: ["q"],
			},
			output: {
				example: {
					products: [
						{
							asin: "B0CXYZ1234",
							title: "Wireless Headphones",
							price: 79.99,
							currency: "USD",
							source: "amazon",
						},
					],
					totalResults: 150,
					page: 1,
					hasMore: true,
				},
			},
		},
	},
	{
		path: "/x402/track",
		method: "GET",
		price: TRACK_PRICE_USD,
		description: "Track any shipment across 3,400+ carriers by tracking number",
		bazaar: {
			input: { number: "1ZA1234E0205271688" },
			inputSchema: {
				properties: {
					number: {
						type: "string",
						description: "Tracking number from any supported carrier (5-50 alphanumeric chars)",
					},
					carrier: {
						type: "integer",
						description:
							"Optional 17TRACK carrier code. Omit to auto-detect from the number format.",
					},
					destinationPostalCode: {
						type: "string",
						description: "Only if a lookup returns ADDITIONAL_FIELD_REQUIRED for a postal code",
					},
					destinationCountry: {
						type: "string",
						description: "ISO 3166-1 alpha-2, paired with destinationPostalCode by some carriers",
					},
					shipDate: {
						type: "string",
						description: "Ship date (YYYY-MM-DD) — only if a carrier requires it",
					},
					phone: {
						type: "string",
						description: "Recipient phone — only if a carrier requires it",
					},
					cpfOrCnpj: {
						type: "string",
						description: "Brazilian CPF/CNPJ — only if a carrier requires it",
					},
				},
				required: ["number"],
			},
			output: {
				example: {
					number: "1ZA1234E0205271688",
					status: "InTransit",
					subStatus: "InTransit_Departure",
					statusDescription: null,
					delivered: false,
					found: true,
					carrier: {
						code: 100002,
						name: "UPS",
						homepage: "https://www.ups.com",
						country: "US",
					},
					lastMileCarrier: null,
					origin: "CN",
					destination: "US",
					latestEvent: {
						time: "2026-07-20T14:32:00-07:00",
						description: "Departed facility",
						location: "SHENZHEN, CN",
						stage: "InTransit",
					},
					milestones: [
						{ stage: "InfoReceived", time: "2026-07-14T09:00:00+08:00" },
						{ stage: "PickedUp", time: "2026-07-15T08:46:00+08:00" },
						{ stage: "Departure", time: "2026-07-20T14:32:00-07:00" },
					],
					pickedUpAt: "2026-07-15T08:46:00+08:00",
					deliveredAt: null,
					daysInTransit: 6,
					daysSinceLastUpdate: 1,
					estimatedDelivery: {
						from: "2026-07-28T08:00:00-05:00",
						to: "2026-07-30T13:00:00-05:00",
						source: "Official",
					},
					serviceType: "UPS Worldwide Express",
					weightKg: "1.1",
					carrierNotice: null,
					trackingPageUrl: "https://t.17track.net/en#nums=1ZA1234E0205271688",
				},
			},
		},
	},
	{
		path: "/x402/vault/search",
		method: "GET",
		price: "0.01",
		description: "Search vault items (skills, knowledge, personas)",
		bazaar: {
			input: { q: "marketing automation" },
			inputSchema: {
				properties: {
					q: { type: "string", description: "Search query" },
					category: {
						type: "string",
						description: "Filter by category",
						enum: ["marketing", "development", "automation", "career", "ios", "productivity"],
					},
					productType: {
						type: "string",
						description: "Filter by type",
						enum: ["skill", "knowledge", "persona"],
					},
					minPrice: { type: "integer", description: "Minimum price in USDC (whole units)" },
					maxPrice: { type: "integer", description: "Maximum price in USDC (whole units)" },
					cursor: { type: "string", description: "Pagination cursor (UUID)" },
					limit: { type: "integer", description: "Items per page (1-100, default 30)" },
				},
			},
			output: {
				example: {
					items: [
						{
							slug: "marketing-automation-pro",
							title: "Marketing Automation Pro",
							productType: "skill",
							price: 5,
							category: "marketing",
						},
					],
					nextCursor: null,
				},
			},
		},
	},
	{
		path: "/x402/vault/download",
		method: "GET",
		price: "0.01",
		description:
			"Download purchased vault item file. URL: /x402/vault/download/:purchaseId?downloadToken=...&txSignature=...",
		bazaar: {
			input: {
				purchaseId: "550e8400-e29b-41d4-a716-446655440000",
				downloadToken: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
			},
			inputSchema: {
				properties: {
					purchaseId: { type: "string", description: "Purchase ID (UUID) — path parameter" },
					downloadToken: {
						type: "string",
						description: "Secret download token from buy response",
					},
					txSignature: {
						type: "string",
						description:
							"On-chain tx signature. Required for first download, optional for re-downloads.",
					},
				},
				required: ["purchaseId", "downloadToken"],
			},
			output: { example: "binary file download (ZIP)" },
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
		const cachedMarkup = (Number.parseFloat(cached.totalPrice) * 1.05).toFixed(2);
		return `$${cachedMarkup}`;
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

	const basePrice = Number.parseFloat(result.totalPrice.amount);
	const markedUpPrice = (basePrice * 1.05).toFixed(2);

	setCachedOrder(bodyHash, {
		orderId: result.orderId,
		totalPrice: result.totalPrice.amount,
		product: result.product,
	});

	return `$${markedUpPrice}`;
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
		bazaar: DeclareDiscoveryExtensionInput;
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
		bazaar: {
			input: {
				asin: "B0CXYZ1234",
				email: "buyer@example.com",
				shippingAddress: {
					name: "John Doe",
					line1: "123 Main St",
					city: "San Francisco",
					state: "CA",
					postalCode: "94102",
					country: "US",
				},
			},
			inputSchema: {
				properties: {
					productUrl: { type: "string", description: "Product URL (Amazon or Shopify)" },
					asin: { type: "string", description: "Amazon ASIN (use this OR productUrl)" },
					shippingAddress: {
						type: "object",
						description: "Shipping address",
						properties: {
							name: { type: "string" },
							line1: { type: "string" },
							line2: { type: "string" },
							city: { type: "string" },
							state: { type: "string" },
							postalCode: { type: "string" },
							country: { type: "string", description: "ISO 3166-1 alpha-2" },
							phone: { type: "string" },
						},
						required: ["name", "line1", "city", "state", "postalCode", "country"],
					},
					email: { type: "string", description: "Email for order confirmation" },
					variantId: { type: "string", description: "Required for Shopify products" },
				},
				required: ["email", "shippingAddress"],
			},
			bodyType: "json",
			output: {
				example: {
					orderId: "550e8400-e29b-41d4-a716-446655440000",
					status: "processing",
					product: { title: "Wireless Headphones", price: { amount: "79.99", currency: "USD" } },
					totalPrice: { amount: "84.99", currency: "USD" },
				},
			},
		},
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
		bazaar: {
			input: {
				slug: "marketing-automation-pro",
				walletAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
				email: "agent@example.com",
			},
			inputSchema: {
				properties: {
					slug: { type: "string", description: "Vault item slug to purchase" },
					walletAddress: { type: "string", description: "Solana wallet address (base58)" },
					email: { type: "string", description: "Email for purchase confirmation" },
				},
				required: ["slug", "walletAddress", "email"],
			},
			bodyType: "json",
			output: {
				example: {
					purchaseId: "550e8400-e29b-41d4-a716-446655440000",
					downloadToken: "e3b0c44298fc1c149afbf4c8996fb924...",
					item: { slug: "marketing-automation-pro", title: "Marketing Automation Pro", price: 5 },
				},
			},
		},
	},
};
