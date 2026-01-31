import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { errorHandler } from "./middleware/error.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { buyRouter } from "./routes/buy.js";
import { searchRouter } from "./routes/search.js";
import { shopRouter } from "./routes/shop.js";

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

// Rate limiting for API routes (60 req/min per IP)
app.use("/search/*", rateLimit({ windowMs: 60 * 1000, maxRequests: 60 }));
app.use("/shop/*", rateLimit({ windowMs: 60 * 1000, maxRequests: 60 }));
app.use("/buy/*", rateLimit({ windowMs: 60 * 1000, maxRequests: 60 }));

// API routes
app.route("/search", searchRouter);
app.route("/shop", shopRouter);
app.route("/buy", buyRouter);

// OpenAPI spec
app.doc("/openapi.json", {
	openapi: "3.1.0",
	info: {
		title: "Purch API",
		version: "1.0.0",
		description: `
# Purch Public API

AI-powered shopping API for product search and checkout.

## Rate Limits

- 60 requests per minute per IP address
- Rate limit headers are included in all responses:
  - \`X-RateLimit-Limit\`: Maximum requests per window
  - \`X-RateLimit-Remaining\`: Requests remaining
  - \`X-RateLimit-Reset\`: Seconds until window resets

## Endpoints

| Endpoint | Description |
|----------|-------------|
| \`GET /search\` | Structured product search with filters |
| \`POST /shop\` | Natural language AI shopping assistant |
| \`POST /buy\` | Create a purchase order |
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
	],
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
