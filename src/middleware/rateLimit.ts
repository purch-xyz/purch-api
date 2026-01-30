import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

interface RateLimitConfig {
	windowMs: number;
	maxRequests: number;
}

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(
	() => {
		const now = Date.now();
		for (const [key, entry] of store) {
			if (entry.resetAt < now) {
				store.delete(key);
			}
		}
	},
	60 * 1000, // Every minute
);

/**
 * IP-based rate limiting middleware.
 * For production, consider using Redis for distributed rate limiting.
 */
export function rateLimit(config: RateLimitConfig) {
	return async (c: Context, next: Next) => {
		const ip = getClientIP(c);
		const now = Date.now();

		let entry = store.get(ip);

		if (!entry || entry.resetAt < now) {
			entry = {
				count: 0,
				resetAt: now + config.windowMs,
			};
		}

		entry.count++;
		store.set(ip, entry);

		const remaining = Math.max(0, config.maxRequests - entry.count);
		const resetIn = Math.ceil((entry.resetAt - now) / 1000);

		c.header("X-RateLimit-Limit", config.maxRequests.toString());
		c.header("X-RateLimit-Remaining", remaining.toString());
		c.header("X-RateLimit-Reset", resetIn.toString());

		if (entry.count > config.maxRequests) {
			throw new HTTPException(429, {
				message: `Rate limit exceeded. Try again in ${resetIn} seconds.`,
			});
		}

		await next();
	};
}

function getClientIP(c: Context): string {
	// Cloudflare
	const cfIP = c.req.header("CF-Connecting-IP");
	if (cfIP) return cfIP;

	// Standard proxy header
	const forwarded = c.req.header("X-Forwarded-For");
	if (forwarded) return forwarded.split(",")[0].trim();

	// Nginx
	const realIP = c.req.header("X-Real-IP");
	if (realIP) return realIP;

	return "unknown";
}
