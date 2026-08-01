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

interface FulfillResult {
	status: string;
	txSignature: string;
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
	private cachedIdToken: { token: string; expiresAt: number } | null = null;

	constructor() {
		this.baseUrl = env.PURCH_BACKEND_URL;
	}

	private async getServiceIdentityToken(): Promise<string | null> {
		const audience = env.PURCH_BACKEND_AUDIENCE;
		if (!audience) return null;

		const now = Date.now();
		if (this.cachedIdToken && now < this.cachedIdToken.expiresAt - 60_000) {
			return this.cachedIdToken.token;
		}

		try {
			const response = await fetch(
				`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}&format=full`,
				{
					headers: {
						"Metadata-Flavor": "Google",
					},
				},
			);

			if (!response.ok) {
				throw new Error(`metadata server returned ${response.status}`);
			}

			const token = await response.text();
			const expiresAt = this.getTokenExpiry(token) ?? now + 55 * 60 * 1000;
			this.cachedIdToken = { token, expiresAt };
			return token;
		} catch (error) {
			const message = error instanceof Error ? error.message : "unknown error";
			throw new Error(`Failed to fetch Google ID token: ${message}`);
		}
	}

	private getTokenExpiry(token: string): number | null {
		try {
			const payloadPart = token.split(".")[1];
			if (!payloadPart) return null;
			const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
			const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

			const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as {
				exp?: number;
			};

			return typeof payload.exp === "number" ? payload.exp * 1000 : null;
		} catch {
			return null;
		}
	}

	private async buildInternalHeaders(
		extraHeaders?: RequestInit["headers"],
		options: { includeJsonContentType?: boolean } = {},
	): Promise<Headers> {
		const headers = new Headers(extraHeaders);
		const includeJsonContentType = options.includeJsonContentType !== false;

		if (includeJsonContentType && !headers.has("Content-Type")) {
			headers.set("Content-Type", "application/json");
		}

		const idToken = await this.getServiceIdentityToken();
		if (idToken) {
			headers.set("Authorization", `Bearer ${idToken}`);
			return headers;
		}

		throw new Error("No Google service identity token is configured for purch-backend");
	}

	private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const headers = await this.buildInternalHeaders(options.headers);

		const response = await fetch(url, {
			...options,
			headers,
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
	 * Fulfill an order by signing and submitting the Crossmint payment server-side.
	 * Used after x402 dynamic pricing payment is verified.
	 * Retries on 5xx errors since the backend instance may be recycled mid-request.
	 */
	async fulfillOrder(orderId: string, maxRetries = 2): Promise<FulfillResult> {
		let lastError: Error & { status?: number } = new Error("fulfillOrder failed");
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await this.request<FulfillResult>(`/api/public/orders/${orderId}/fulfill`, {
					method: "POST",
				});
			} catch (err) {
				lastError = err as Error & { status?: number };
				const isRetryable = lastError.status !== undefined && lastError.status >= 500;
				if (!isRetryable || attempt === maxRetries) throw lastError;
				await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
			}
		}
		throw lastError;
	}
}

export const purchClient = new PurchClient();
