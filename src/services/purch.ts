import { env } from "../config/env.js";
import type { Product, ShippingAddress, VaultItem } from "../types/index.js";

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

interface VaultSearchParams {
	search?: string;
	category?: string;
	productType?: string;
	minPrice?: number;
	maxPrice?: number;
	cursor?: string;
	limit?: number;
}

interface VaultSearchResult {
	items: VaultItem[];
	nextCursor: string | null;
}

interface VaultBuyParams {
	slug: string;
	walletAddress: string;
	email: string;
}

interface VaultBuyResult {
	purchaseId: string;
	downloadToken: string;
	serializedTransaction: string;
	blockhash: string;
	lastValidBlockHeight: number;
	item: {
		slug: string;
		title: string;
		productType: "skill" | "knowledge" | "persona";
		price: number;
		coverImageUrl: string | null;
	} | null;
	payment: {
		amountMicroUsdc: string;
		amountUsdc: string;
		network: "solana";
	};
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

	/**
	 * Search vault items (skills, knowledge bases, personas).
	 */
	async vaultSearch(params: VaultSearchParams): Promise<VaultSearchResult> {
		const searchParams = new URLSearchParams();
		if (params.search) searchParams.set("search", params.search);
		if (params.category) searchParams.set("category", params.category);
		if (params.productType) searchParams.set("productType", params.productType);
		if (params.minPrice !== undefined) searchParams.set("minPrice", params.minPrice.toString());
		if (params.maxPrice !== undefined) searchParams.set("maxPrice", params.maxPrice.toString());
		if (params.cursor) searchParams.set("cursor", params.cursor);
		if (params.limit !== undefined) searchParams.set("limit", params.limit.toString());

		return this.request<VaultSearchResult>(`/api/vault?${searchParams}`);
	}

	/**
	 * Initiate a vault item purchase.
	 * Returns purchase intent + serialized USDC transaction for signing.
	 */
	async vaultBuy(params: VaultBuyParams): Promise<VaultBuyResult> {
		return this.request<VaultBuyResult>("/api/public/vault/purchase", {
			method: "POST",
			body: JSON.stringify(params),
		});
	}

	/**
	 * Download a vault item file. Returns the raw response for streaming.
	 * Automatically verifies on-chain payment if not yet verified.
	 */
	async vaultDownload(
		purchaseId: string,
		downloadToken: string,
		txSignature?: string,
	): Promise<Response> {
		const params = new URLSearchParams({ downloadToken });
		if (txSignature) params.set("txSignature", txSignature);
		const url = `${this.baseUrl}/api/public/vault/download/${purchaseId}?${params}`;

		const response = await fetch(url, {
			headers: {
				"X-Internal-Key": this.apiKey,
			},
		});

		if (!response.ok) {
			const error = (await response.json().catch(() => ({}))) as {
				error?: string;
				message?: string;
			};
			const message = error.error || error.message || "Download failed";
			const apiError = new Error(message) as Error & { status: number };
			apiError.status = response.status;
			throw apiError;
		}

		return response;
	}
}

export const purchClient = new PurchClient();
