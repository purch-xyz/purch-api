/**
 * In-memory cache for order quotes between 402 response and payment verification.
 * Keyed by SHA-256 hash of request body so the same request on retry hits the cache.
 */

const ORDER_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

interface CachedOrder {
	orderId: string;
	totalPrice: string;
	product: {
		title?: string;
		imageUrl?: string;
		price?: { amount: string; currency: string };
	};
	createdAt: number;
}

interface CachedVaultItem {
	slug: string;
	price: number;
	title: string;
	productType: string;
	createdAt: number;
}

const orderCache = new Map<string, CachedOrder>();
const vaultCache = new Map<string, CachedVaultItem>();

// Periodic cleanup of expired entries
setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of orderCache) {
		if (now - entry.createdAt > ORDER_TTL_MS) {
			orderCache.delete(key);
		}
	}
	for (const [key, entry] of vaultCache) {
		if (now - entry.createdAt > ORDER_TTL_MS) {
			vaultCache.delete(key);
		}
	}
}, CLEANUP_INTERVAL_MS);

function hashBody(body: unknown): string {
	const text = JSON.stringify(body);
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(text);
	return hasher.digest("hex");
}

export function getCachedOrder(hash: string, maxAgeMs?: number): CachedOrder | undefined {
	const entry = orderCache.get(hash);
	if (!entry) return undefined;
	const ttl = maxAgeMs ?? ORDER_TTL_MS;
	if (Date.now() - entry.createdAt > ttl) {
		orderCache.delete(hash);
		return undefined;
	}
	return entry;
}

export function setCachedOrder(hash: string, order: Omit<CachedOrder, "createdAt">): void {
	orderCache.set(hash, { ...order, createdAt: Date.now() });
}

export function getCachedVaultItem(hash: string): CachedVaultItem | undefined {
	const entry = vaultCache.get(hash);
	if (!entry) return undefined;
	if (Date.now() - entry.createdAt > ORDER_TTL_MS) {
		vaultCache.delete(hash);
		return undefined;
	}
	return entry;
}

export function setCachedVaultItem(hash: string, item: Omit<CachedVaultItem, "createdAt">): void {
	vaultCache.set(hash, { ...item, createdAt: Date.now() });
}

export { hashBody };
