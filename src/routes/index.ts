import { OpenAPIHono } from "@hono/zod-openapi";
import { rateLimit } from "../middleware/rateLimit.js";
import { searchRouter } from "./search.js";
import { shopRouter } from "./shop.js";

export const routes = new OpenAPIHono();

// Rate limit by IP (60 requests per minute)
routes.use(
	"*",
	rateLimit({
		windowMs: 60 * 1000,
		maxRequests: 60,
	}),
);

// Mount route handlers
routes.route("/search", searchRouter);
routes.route("/shop", shopRouter);
