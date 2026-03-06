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
		path: "/x402/buy",
		method: "POST",
		price: "0.01",
		description: "Create order and get serialized transaction",
		inputSchema: {
			type: "http",
			method: "POST",
			bodyFields: {
				productUrl: { type: "string", description: "Product URL (required if no asin)" },
				asin: { type: "string", description: "Amazon ASIN (required if no productUrl)" },
				email: { type: "string", description: "Email for order confirmation", required: true },
				shippingAddress: {
					type: "object",
					description: "Shipping address with name, line1, city, state, postalCode, country",
					required: true,
				},
				walletAddress: {
					type: "string",
					description: "Solana (base58) or EVM (0x) wallet address",
					required: true,
				},
				variantId: { type: "string", description: "Required for Shopify products" },
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
		path: "/x402/vault/buy",
		method: "POST",
		price: "0.01",
		description: "Initiate vault purchase and get serialized transaction",
		inputSchema: {
			type: "http",
			method: "POST",
			bodyFields: {
				slug: { type: "string", description: "Vault item slug", required: true },
				walletAddress: {
					type: "string",
					description: "Solana wallet address (base58)",
					required: true,
				},
				email: { type: "string", description: "Email for purchase confirmation", required: true },
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
