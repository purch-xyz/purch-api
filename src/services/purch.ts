import { env } from "../config/env.js";
import type { Product, ShippingAddress } from "../types/index.js";

interface SearchParams {
	query: string;
	priceMin?: number;
	priceMax?: number;
	brand?: string;
	page?: number;
}

interface SearchResult {
	products: Product[];
	totalResults: number;
	page: number;
	hasMore: boolean;
}

interface ShopParams {
	message: string;
	context?: {
		priceRange?: { min?: number; max?: number };
		preferences?: string[];
	};
}

interface ShopResult {
	reply: string;
	products: Product[];
}

interface BuyParams {
	productUrl?: string;
	asin?: string;
	shippingAddress: ShippingAddress;
	email: string;
	walletAddress: string;
	variantId?: string;
}

interface BuyResult {
	orderId: string;
	status: string;
	serializedTransaction: string;
	product: {
		title?: string;
		imageUrl?: string;
		price?: {
			amount: string;
			currency: string;
		};
	};
	totalPrice: {
		amount: string;
		currency: string;
	};
	checkoutUrl: string;
}

class PurchClient {
	private baseUrl: string;
	private apiKey: string;

	constructor() {
		this.baseUrl = env.PURCH_BACKEND_URL;
		this.apiKey = env.PURCH_INTERNAL_API_KEY;
	}

	private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;

		const response = await fetch(url, {
			...options,
			headers: {
				"Content-Type": "application/json",
				"X-Internal-Key": this.apiKey,
				...options.headers,
			},
		});

		if (!response.ok) {
			const error = (await response.json().catch(() => ({}))) as {
				message?: string;
				error?: string;
				code?: string;
				details?: unknown;
			};
			const message = error.error || error.message || "Unknown error";
			const apiError = new Error(message) as Error & { status: number; code?: string };
			apiError.status = response.status;
			apiError.code = error.code;
			throw apiError;
		}

		return response.json() as Promise<T>;
	}

	/**
	 * Search for products using structured filters.
	 */
	async search(params: SearchParams): Promise<SearchResult> {
		const searchParams = new URLSearchParams({
			query: params.query,
			...(params.priceMin && { priceMin: params.priceMin.toString() }),
			...(params.priceMax && { priceMax: params.priceMax.toString() }),
			...(params.brand && { brand: params.brand }),
			page: (params.page ?? 1).toString(),
		});

		return this.request<SearchResult>(`/api/search?${searchParams}`);
	}

	/**
	 * Natural language shopping assistant.
	 */
	async shop(params: ShopParams): Promise<ShopResult> {
		return this.request<ShopResult>("/api/agent/shop", {
			method: "POST",
			body: JSON.stringify(params),
		});
	}

	/**
	 * Create a purchase order for a product.
	 * Auto-detects chain from wallet address format:
	 * - 0x... = Base (EVM)
	 * - base58 = Solana
	 */
	async buy(params: BuyParams): Promise<BuyResult> {
		const isEvmWallet = /^0x[a-fA-F0-9]{40}$/.test(params.walletAddress);
		const endpoint = isEvmWallet ? "/api/public/orders/base" : "/api/public/orders";

		return this.request<BuyResult>(endpoint, {
			method: "POST",
			body: JSON.stringify(params),
		});
	}
}

export const purchClient = new PurchClient();
