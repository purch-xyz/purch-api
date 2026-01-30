import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { BuyRequestSchema, BuyResponseSchema } from "../schemas/buy.js";
import { ApiErrorSchema } from "../schemas/common.js";
import { purchClient } from "../services/purch.js";

export const buyRouter = new OpenAPIHono();

const buyRoute = createRoute({
	method: "post",
	path: "/",
	tags: ["Buy"],
	summary: "One-command checkout",
	description: `Create a purchase order for a product. Provide either a product URL or ASIN along with shipping details and wallet address.

Returns a serialized Solana transaction that must be signed by the wallet to complete the purchase.`,
	request: {
		body: {
			content: {
				"application/json": {
					schema: BuyRequestSchema,
				},
			},
			required: true,
		},
	},
	responses: {
		200: {
			description: "Order created successfully",
			content: {
				"application/json": {
					schema: BuyResponseSchema,
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
		401: {
			description: "Unauthorized",
			content: {
				"application/json": {
					schema: ApiErrorSchema,
				},
			},
		},
	},
});

buyRouter.openapi(buyRoute, async (c) => {
	const body = c.req.valid("json");

	const result = await purchClient.buy({
		productUrl: body.productUrl,
		asin: body.asin,
		shippingAddress: body.shippingAddress,
		email: body.email,
		walletAddress: body.walletAddress,
		variantId: body.variantId,
	});

	return c.json(result, 200);
});
