import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { ApiErrorSchema, PaymentRequiredSchema } from "../schemas/common.js";
import { SearchQuerySchema, SearchResponseSchema } from "../schemas/search.js";
import { purchClient } from "../services/purch.js";

export const searchRouter = new OpenAPIHono();

const searchRoute = createRoute({
	method: "get",
	path: "/",
	tags: ["Search"],
	summary: "Search products",
	description:
		"Search for products using structured filters. Returns paginated results from Amazon and Shopify.",
	request: {
		query: SearchQuerySchema,
	},
	responses: {
		200: {
			description: "Search results",
			content: {
				"application/json": {
					schema: SearchResponseSchema,
				},
			},
		},
		400: {
			description: "Validation error",
			content: {
				"application/json": {
					schema: ApiErrorSchema,
				},
			},
		},
		402: {
			description: "Payment Required",
			content: {
				"application/json": {
					schema: PaymentRequiredSchema,
				},
			},
		},
	},
});

searchRouter.openapi(searchRoute, async (c) => {
	const { q, priceMin, priceMax, brand, page } = c.req.valid("query");

	const result = await purchClient.search({
		query: q,
		priceMin,
		priceMax,
		brand,
		page,
	});

	return c.json(result, 200);
});
