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
		path: "/shop",
		method: "POST",
		price: "0.10",
		description: "AI-powered product search",
		inputSchema: {
			type: "http",
			method: "POST",
			bodyFields: {
				message: { type: "string", description: "Natural language product search query", required: true },
				context: { type: "object", description: "Optional context with priceRange and preferences" },
			},
		},
	},
	{
		path: "/search",
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
		path: "/buy",
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
				shippingAddress: { type: "object", description: "Shipping address with name, line1, city, state, postalCode, country", required: true },
				walletAddress: { type: "string", description: "Solana (base58) or EVM (0x) wallet address", required: true },
				variantId: { type: "string", description: "Required for Shopify products" },
			},
		},
	},
];
