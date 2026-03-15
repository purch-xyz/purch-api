import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { errorHandler } from "./middleware/error.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { buyRouter } from "./routes/buy.js";
import { searchRouter } from "./routes/search.js";
import { shopRouter } from "./routes/shop.js";
import { vaultBuyRouter } from "./routes/vault-buy.js";
import { vaultDownloadRouter } from "./routes/vault-download.js";
import { vaultSearchRouter } from "./routes/vault-search.js";
import { x402BuyRouter } from "./routes/x402-buy.js";
import { x402VaultBuyRouter } from "./routes/x402-vault-buy.js";
import { PAYABLE_ROUTES } from "./x402/config.js";
import { handle402Probe, handleDynamic402Probe, x402Middleware } from "./x402/middleware.js";

// --- Helpers for x402 bazaar discovery extensions ---

// biome-ignore lint/suspicious/noExplicitAny: OpenAPI spec traversal requires dynamic access
function resolveRef(ref: string, spec: Record<string, any>): Record<string, any> | undefined {
	const parts = ref.replace("#/", "").split("/");
	// biome-ignore lint/suspicious/noExplicitAny: traversing unknown spec shape
	let current: any = spec;
	for (const part of parts) {
		if (current && typeof current === "object") {
			current = current[part];
		} else {
			return undefined;
		}
	}
	return current;
}

// biome-ignore lint/suspicious/noExplicitAny: OpenAPI operation shape is dynamic
function buildBazaarInput(op: Record<string, any>, spec: Record<string, any>) {
	const rbSchema = op.requestBody?.content?.["application/json"]?.schema;
	if (rbSchema) {
		if (rbSchema.$ref && typeof rbSchema.$ref === "string") return resolveRef(rbSchema.$ref, spec);
		return rbSchema;
	}
	// biome-ignore lint/suspicious/noExplicitAny: OpenAPI parameter shape
	const params = op.parameters as Array<Record<string, any>> | undefined;
	if (params?.length) {
		const properties: Record<string, unknown> = {};
		const required: string[] = [];
		for (const p of params) {
			if (p.in === "query" || p.in === "path") {
				properties[p.name] = {
					...p.schema,
					...(p.description ? { description: p.description } : {}),
				};
				if (p.required) required.push(p.name);
			}
		}
		return { type: "object", properties, ...(required.length ? { required } : {}) };
	}
	return undefined;
}

// biome-ignore lint/suspicious/noExplicitAny: OpenAPI operation shape is dynamic
function buildBazaarOutput(op: Record<string, any>, spec: Record<string, any>) {
	const schema = op.responses?.["200"]?.content?.["application/json"]?.schema;
	if (!schema) return undefined;
	if (schema.$ref && typeof schema.$ref === "string") return resolveRef(schema.$ref, spec);
	return schema;
}

export const app = new OpenAPIHono();

// Global middleware
app.use("*", cors());
app.use("*", secureHeaders());

// Health check
app.get("/health", (c) =>
	c.json({
		status: "ok",
		timestamp: new Date().toISOString(),
	}),
);

// Rate limiting for open API routes (60 req/min per IP)
app.use("/search/*", rateLimit({ windowMs: 60 * 1000, maxRequests: 60 }));
app.use("/shop/*", rateLimit({ windowMs: 60 * 1000, maxRequests: 60 }));
app.use("/buy/*", rateLimit({ windowMs: 60 * 1000, maxRequests: 60 }));
app.use("/vault/*", rateLimit({ windowMs: 60 * 1000, maxRequests: 60 }));

// x402 rate limiting (60 req/min per IP)
app.use("/x402/*", rateLimit({ windowMs: 60 * 1000, maxRequests: 60 }));

// x402 payment middleware — verifies and settles payments via Coinbase facilitator
// Handles both static pricing (search, shop) and dynamic pricing (buy, vault/buy)
app.use("/x402/*", x402Middleware);

// GET probe handlers for POST-only x402 routes (x402scan probes both GET and POST)
const shopRoute = PAYABLE_ROUTES.find((r) => r.path === "/x402/shop")!;
app.get("/x402/shop", (c) => handle402Probe(c, shopRoute));
app.get("/x402/buy", (c) => handleDynamic402Probe(c, "POST /x402/buy"));
app.get("/x402/vault/buy", (c) => handleDynamic402Probe(c, "POST /x402/vault/buy"));

// POST probe handlers for dynamic-priced routes: x402 middleware fails on empty body
// (dynamic price function can't compute without a body), so return 402 manually
app.use("/x402/buy", async (c, next) => {
	if (c.req.method === "POST" && !c.req.header("x-payment") && !c.req.header("payment-signature")) {
		return handleDynamic402Probe(c, "POST /x402/buy");
	}
	return next();
});
app.use("/x402/vault/buy", async (c, next) => {
	if (c.req.method === "POST" && !c.req.header("x-payment") && !c.req.header("payment-signature")) {
		return handleDynamic402Probe(c, "POST /x402/vault/buy");
	}
	return next();
});

// Vault/download 402 probe: x402 middleware can't match parameterized paths,
// so return 402 manually when no payment header is present (before route validation)
const vaultDownloadRoute = PAYABLE_ROUTES.find((r) => r.path === "/x402/vault/download")!;
app.use("/x402/vault/download/:purchaseId", async (c, next) => {
	if (!c.req.header("x-payment") && !c.req.header("payment-signature")) {
		return handle402Probe(c, vaultDownloadRoute);
	}
	return next();
});

// Open routes (partners — no x402 gate)
app.route("/search", searchRouter);
app.route("/shop", shopRouter);
app.route("/buy", buyRouter);
app.route("/vault/search", vaultSearchRouter);
app.route("/vault/buy", vaultBuyRouter);
app.route("/vault/download", vaultDownloadRouter);

// x402 routes (AI agents — gated by x402 middleware above)
app.route("/x402/search", searchRouter);
app.route("/x402/shop", shopRouter);
app.route("/x402/buy", x402BuyRouter); // dynamic pricing — product price
app.route("/x402/vault/search", vaultSearchRouter);
app.route("/x402/vault/buy", x402VaultBuyRouter); // dynamic pricing — item price
app.route("/x402/vault/download", vaultDownloadRouter);

// Dynamic pricing route paths (for OpenAPI augmentation)
const DYNAMIC_PRICING_ROUTES = [
	{ path: "/x402/buy", method: "POST" },
	{ path: "/x402/vault/buy", method: "POST" },
];

// Custom OpenAPI spec with x402 extensions
app.get("/openapi.json", (c) => {
	const baseConfig = {
		openapi: "3.1.0" as const,
		info: {
			title: "Purch API",
			version: "1.0.0",
			description:
				"AI-powered shopping API for product search and crypto checkout. All endpoints are payable via the x402 protocol (USDC on Solana).",
			guidance: `Purch API lets AI agents search for products and purchase them using x402 micropayments (USDC on Solana).

## Quick Start
1. Search for products: GET /x402/search?q=headphones
2. Or use natural language: POST /x402/shop with {"message": "comfortable running shoes under $150"}
3. Buy a product: POST /x402/buy with the ASIN or product URL, shipping address, and email
4. Browse digital goods: GET /x402/vault/search
5. Buy digital goods: POST /x402/vault/buy with the item slug

## Payment
All endpoints require x402 payment. On first request you'll receive a 402 response with payment details.
Your x402 client handles payment automatically — no wallet setup or transaction signing needed.

## Pricing
- Search endpoints (GET /x402/search, GET /x402/vault/search): $0.01 per call
- AI shopping assistant (POST /x402/shop): $0.10 per call
- Product purchases (POST /x402/buy): dynamic — equals the product total (including tax/shipping)
- Vault purchases (POST /x402/vault/buy): dynamic — equals the item price in USDC

## Product Identification
- Amazon products: use "asin" (e.g. "B0CXYZ1234") or "productUrl" (e.g. "https://amazon.com/dp/B0CXYZ1234")
- Shopify products: use "productUrl" + "variantId"
- Vault items: use "slug" (e.g. "marketing-automation-pro")`,
			contact: {
				name: "Purch Support",
				url: "https://purch.xyz",
			},
		},
		servers: [{ url: "https://api.purch.xyz", description: "Production" }],
		tags: [
			{ name: "Search", description: "Product search endpoints" },
			{ name: "Shop", description: "AI-powered shopping assistant" },
			{ name: "Buy", description: "Checkout and order management" },
			{ name: "Vault", description: "AI skills, knowledge bases, and personas marketplace" },
		],
	};

	// Get the auto-generated OpenAPI document with full Zod schemas
	const spec = app.getOpenAPIDocument(baseConfig);

	// Filter: only expose /x402/* paths in OpenAPI spec
	if (spec.paths) {
		for (const path of Object.keys(spec.paths)) {
			if (!path.startsWith("/x402/")) {
				delete spec.paths[path];
			}
		}
	}

	// Add x402 security scheme
	if (!spec.components) spec.components = {};
	spec.components.securitySchemes = {
		...spec.components.securitySchemes,
		x402: {
			type: "apiKey",
			in: "header",
			name: "PAYMENT-SIGNATURE",
		},
	};

	// Helper: find spec path matching a route (handles parameterized paths)
	const findSpecPath = (routePath: string) =>
		Object.keys(spec.paths ?? {}).find((p) => p === routePath || p.startsWith(`${routePath}/`));

	// Augment static-priced paths with x402 extensions
	for (const route of PAYABLE_ROUTES) {
		const method = route.method.toLowerCase();
		const specPath = findSpecPath(route.path);
		if (!specPath) continue;

		const pathSpec = spec.paths![specPath];
		const operation = pathSpec[method as keyof typeof pathSpec] as
			| Record<string, unknown>
			| undefined;
		if (!operation) continue;

		operation["x-agentcash-auth"] = { mode: "paid" };
		operation["x-payment-info"] = {
			protocols: ["x402"],
			pricingMode: "fixed",
			price: route.price,
		};
		operation.security = [{ x402: [] }];
	}

	// Augment dynamic-priced paths with x402 extensions
	for (const route of DYNAMIC_PRICING_ROUTES) {
		const method = route.method.toLowerCase();
		const pathSpec = spec.paths?.[route.path];
		if (!pathSpec) continue;

		const operation = pathSpec[method as keyof typeof pathSpec] as
			| Record<string, unknown>
			| undefined;
		if (!operation) continue;

		operation["x-agentcash-auth"] = { mode: "paid" };
		operation["x-payment-info"] = {
			protocols: ["x402"],
			pricingMode: "quote",
		};
		operation.security = [{ x402: [] }];
	}

	// Add x402 bazaar discovery extensions (input/output schemas) to all operations
	for (const pathSpec of Object.values(spec.paths ?? {})) {
		for (const [key, value] of Object.entries(pathSpec as Record<string, unknown>)) {
			if (key === "parameters" || typeof value !== "object" || !value) continue;
			const operation = value as Record<string, unknown>;
			const input = buildBazaarInput(operation, spec);
			const output = buildBazaarOutput(operation, spec);
			if (input || output) {
				operation.extensions = {
					bazaar: {
						schema: {
							properties: {
								...(input ? { input } : {}),
								...(output ? { output } : {}),
							},
						},
					},
				};
			}
		}
	}

	// Remove the /openapi.json path from the spec (self-reference)
	if (spec.paths?.["/openapi.json"]) {
		// biome-ignore lint/performance/noDelete: cleaning up generated spec object
		delete spec.paths["/openapi.json"];
	}

	return c.json(spec);
});

// /.well-known/x402 discovery fallback
app.get("/.well-known/x402", (c) =>
	c.json({
		version: 1,
		resources: [
			"GET /x402/search",
			"POST /x402/shop",
			"POST /x402/buy",
			"GET /x402/vault/search",
			"POST /x402/vault/buy",
			"GET /x402/vault/download/{purchaseId}",
		],
	}),
);

// Swagger UI
app.get("/docs", swaggerUI({ url: "/openapi.json", title: "Purch API" }));

// Root redirect to docs
app.get("/", (c) => c.redirect("/docs"));

// Error handler
app.onError(errorHandler);

// 404 handler
app.notFound((c) =>
	c.json(
		{
			code: "NOT_FOUND",
			message: `Route ${c.req.method} ${c.req.path} not found`,
		},
		404,
	),
);
