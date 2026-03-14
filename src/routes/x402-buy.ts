import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { env } from "../config/env.js";
import { X402BuyRequestSchema, X402BuyResponseSchema } from "../schemas/buy.js";
import { ApiErrorSchema, PaymentRequiredSchema } from "../schemas/common.js";
import { purchClient } from "../services/purch.js";
import { getCachedOrder, hashBody, setCachedOrder } from "../x402/order-cache.js";

export const x402BuyRouter = new OpenAPIHono();

const x402BuyRoute = createRoute({
	method: "post",
	path: "/",
	tags: ["Buy"],
	summary: "Purchase a product (x402 dynamic pricing)",
	description: `Purchase a product with x402 dynamic pricing. The x402 payment amount equals the product's total price (including tax and shipping).

## How it works
1. Send your request — you'll receive a 402 response with the exact product price
2. Your x402 client handles payment automatically (USDC on Solana)
3. On successful payment, the order is fulfilled and you receive confirmation

## Amazon Products
Use **either**:
- \`asin\` - The Amazon ASIN (e.g., \`B0CXYZ1234\`)
- \`productUrl\` - Amazon product URL (e.g., \`https://amazon.com/dp/B0CXYZ1234\`)

## Shopify Products
Use **both**:
- \`productUrl\` - Shopify product URL (e.g., \`https://store.com/products/item-name\`)
- \`variantId\` - The specific variant ID (e.g., \`41913945718867\`)

## Response
Returns order confirmation with status and product details. No transaction signing needed.`,
	request: {
		body: {
			content: {
				"application/json": {
					schema: X402BuyRequestSchema,
				},
			},
			required: true,
		},
	},
	responses: {
		200: {
			description: "Order created and paid successfully",
			content: {
				"application/json": {
					schema: X402BuyResponseSchema,
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
			description: "Payment Required — price equals the product total",
			content: {
				"application/json": {
					schema: PaymentRequiredSchema,
				},
			},
		},
	},
});

x402BuyRouter.openapi(x402BuyRoute, async (c) => {
	const body = c.req.valid("json");

	const bodyHash = hashBody(body);
	let cached = getCachedOrder(bodyHash);

	// Cache miss — recreate the order (happens when Cloud Run routes the
	// paid retry to a different instance than the 402 probe)
	if (!cached) {
		const result = await purchClient.buy({
			productUrl: body.productUrl,
			asin: body.asin,
			shippingAddress: body.shippingAddress,
			email: body.email,
			walletAddress: env.ORDER_TREASURY_WALLET,
			variantId: body.variantId,
		});

		setCachedOrder(bodyHash, {
			orderId: result.orderId,
			totalPrice: result.totalPrice.amount,
			product: result.product,
		});

		cached = getCachedOrder(bodyHash)!;
	}

	// Fulfill the order — backend signs and submits Crossmint payment
	const fulfillResult = await purchClient.fulfillOrder(cached.orderId);

	return c.json(
		{
			orderId: cached.orderId,
			status: fulfillResult.status,
			product: cached.product,
			totalPrice: {
				amount: cached.totalPrice,
				currency: "usdc",
			},
		},
		200,
	);
});
