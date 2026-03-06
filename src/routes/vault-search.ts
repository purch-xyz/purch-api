import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { ApiErrorSchema, PaymentRequiredSchema } from "../schemas/common.js";
import { VaultSearchQuerySchema, VaultSearchResponseSchema } from "../schemas/vault.js";
import { purchClient } from "../services/purch.js";

export const vaultSearchRouter = new OpenAPIHono();

const vaultSearchRoute = createRoute({
	method: "get",
	path: "/",
	tags: ["Vault"],
	summary: "Search vault items",
	description:
		"Search for AI skills, knowledge bases, and personas in the Purch Vault. Filter by category, product type, and price range. Returns cursor-paginated results.",
	request: {
		query: VaultSearchQuerySchema,
	},
	responses: {
		200: {
			description: "Vault search results",
			content: {
				"application/json": {
					schema: VaultSearchResponseSchema,
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

vaultSearchRouter.openapi(vaultSearchRoute, async (c) => {
	const { q, category, productType, minPrice, maxPrice, cursor, limit } = c.req.valid("query");

	const result = await purchClient.vaultSearch({
		search: q,
		category,
		productType,
		minPrice,
		maxPrice,
		cursor,
		limit,
	});

	return c.json(result, 200);
});
