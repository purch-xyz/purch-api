import { z } from "@hono/zod-openapi";
import { ProductSchema } from "./common.js";

export const ShopRequestSchema = z
	.object({
		message: z.string().min(1).max(1000).openapi({
			example: "I need comfortable running shoes under $150 with good arch support",
			description: "Natural language shopping request",
		}),
		context: z
			.object({
				priceRange: z
					.object({
						min: z.number().optional(),
						max: z.number().optional(),
					})
					.optional(),
				preferences: z
					.array(z.string())
					.optional()
					.openapi({
						example: ["eco-friendly", "minimalist"],
						description: "Style or feature preferences",
					}),
			})
			.optional()
			.openapi({
				description: "Optional context to guide the AI assistant",
			}),
	})
	.openapi("ShopRequest");

export const ShopResponseSchema = z
	.object({
		reply: z.string().openapi({
			example:
				"I found some great running shoes for you! Here are my top recommendations based on comfort and arch support...",
			description: "AI assistant response message",
		}),
		products: z.array(ProductSchema).openapi({
			description: "Recommended products based on the conversation",
		}),
	})
	.openapi("ShopResponse");

export type ShopRequest = z.infer<typeof ShopRequestSchema>;
export type ShopResponse = z.infer<typeof ShopResponseSchema>;
