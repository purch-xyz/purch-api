import { z } from "@hono/zod-openapi";
import { ProductSchema } from "./common.js";

export const SearchQuerySchema = z.object({
	q: z
		.string()
		.min(1)
		.openapi({
			param: { name: "q", in: "query" },
			example: "wireless headphones",
			description: "Search query",
		}),
	priceMin: z.coerce
		.number()
		.positive()
		.optional()
		.openapi({
			param: { name: "priceMin", in: "query" },
			example: 20,
			description: "Minimum price filter",
		}),
	priceMax: z.coerce
		.number()
		.positive()
		.optional()
		.openapi({
			param: { name: "priceMax", in: "query" },
			example: 200,
			description: "Maximum price filter",
		}),
	brand: z
		.string()
		.optional()
		.openapi({
			param: { name: "brand", in: "query" },
			example: "Sony",
			description: "Filter by brand",
		}),
	page: z.coerce
		.number()
		.int()
		.positive()
		.default(1)
		.openapi({
			param: { name: "page", in: "query" },
			example: 1,
			description: "Page number for pagination",
		}),
});

export const SearchResponseSchema = z
	.object({
		products: z.array(ProductSchema),
		totalResults: z.number().openapi({ example: 150 }),
		page: z.number().openapi({ example: 1 }),
		hasMore: z.boolean().openapi({ example: true }),
	})
	.openapi("SearchResponse");

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
