import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { ApiErrorSchema } from "../schemas/common.js";
import { ShopRequestSchema, ShopResponseSchema } from "../schemas/shop.js";
import { purchClient } from "../services/purch.js";

export const shopRouter = new OpenAPIHono();

const shopRoute = createRoute({
	method: "post",
	path: "/",
	tags: ["Shop"],
	summary: "AI shopping assistant",
	description:
		"Natural language product search powered by AI. Describe what you're looking for and get personalized recommendations.",
	request: {
		body: {
			content: {
				"application/json": {
					schema: ShopRequestSchema,
				},
			},
			required: true,
		},
	},
	responses: {
		200: {
			description: "AI response with product recommendations",
			content: {
				"application/json": {
					schema: ShopResponseSchema,
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

shopRouter.openapi(shopRoute, async (c) => {
	const body = c.req.valid("json");

	const result = await purchClient.shop({
		message: body.message,
		context: body.context,
	});

	return c.json(result, 200);
});
