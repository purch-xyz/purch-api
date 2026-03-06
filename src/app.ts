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
import { PAYABLE_ROUTES } from "./x402/config.js";
import { handle402Probe, x402Middleware } from "./x402/middleware.js";

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
app.use("/x402/*", x402Middleware);

// GET probe handlers for POST-only x402 routes (x402scan probes both GET and POST)
const shopRoute = PAYABLE_ROUTES.find((r) => r.path === "/x402/shop")!;
const buyRoute = PAYABLE_ROUTES.find((r) => r.path === "/x402/buy")!;
const vaultBuyRoute = PAYABLE_ROUTES.find((r) => r.path === "/x402/vault/buy")!;
app.get("/x402/shop", (c) => handle402Probe(c, shopRoute));
app.get("/x402/buy", (c) => handle402Probe(c, buyRoute));
app.get("/x402/vault/buy", (c) => handle402Probe(c, vaultBuyRoute));

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
app.route("/x402/buy", buyRouter);
app.route("/x402/vault/search", vaultSearchRouter);
app.route("/x402/vault/buy", vaultBuyRouter);
app.route("/x402/vault/download", vaultDownloadRouter);

// Custom OpenAPI spec with x402 extensions
app.get("/openapi.json", (c) => {
	const baseConfig = {
		openapi: "3.1.0" as const,
		info: {
			title: "Purch API",
			version: "1.0.0",
			description: `
# Purch Public API

AI-powered shopping API for product search and checkout. All endpoints are payable via the x402 protocol.

## x402 Payment

All API endpoints require payment via the x402 protocol. Send a valid \`X-PAYMENT\` header with your request.
Without it, the API returns a \`402 Payment Required\` response with payment instructions.

## Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| \`GET /x402/search\` | $0.01 | Structured product search with filters |
| \`POST /x402/shop\` | $0.10 | Natural language AI shopping assistant |
| \`POST /x402/buy\` | $0.01 | Create a purchase order |
| \`GET /x402/vault/search\` | $0.01 | Search vault items (skills, knowledge, personas) |
| \`POST /x402/vault/buy\` | $0.01 | Initiate purchase — returns \`serializedTransaction\`, \`purchaseId\`, and \`downloadToken\` |
| \`GET /x402/vault/download/:purchaseId\` | $0.01 | Download purchased file — requires \`downloadToken\` query param, \`txSignature\` on first download |
`,
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
			name: "X-PAYMENT",
		},
	};

	// Augment payable paths with x402 extensions
	for (const route of PAYABLE_ROUTES) {
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
			pricingMode: "fixed",
			price: route.price,
		};
		operation.security = [{ x402: [] }];
	}

	// Remove the /openapi.json path from the spec (self-reference)
	if (spec.paths?.["/openapi.json"]) {
		delete spec.paths["/openapi.json"];
	}

	return c.json(spec);
});

// Swagger UI
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

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
