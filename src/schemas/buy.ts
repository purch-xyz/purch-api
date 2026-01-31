import { z } from "@hono/zod-openapi";
import { ShippingAddressSchema } from "./common.js";

export const BuyRequestSchema = z
	.object({
		productUrl: z.string().url().optional().openapi({
			example: "https://amazon.com/dp/B0CXYZ1234",
			description:
				"Product URL. For Amazon: https://amazon.com/dp/ASIN. For Shopify: https://store.com/products/item-name (requires variantId)",
		}),
		asin: z.string().optional().openapi({
			example: "B0CXYZ1234",
			description: "Amazon ASIN (10-character code). Use this OR productUrl for Amazon products",
		}),
		shippingAddress: ShippingAddressSchema,
		email: z.string().email().openapi({
			example: "john@example.com",
			description: "Email for order confirmation",
		}),
		walletAddress: z.string().openapi({
			example: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
			description:
				"Wallet address for payment. Solana (base58) or Base/EVM (0x...). Chain is auto-detected from format.",
		}),
		variantId: z.string().optional().openapi({
			example: "41913945718867",
			description: "Required for Shopify products. The specific variant ID from the product",
		}),
	})
	.refine((data) => data.productUrl || data.asin, {
		message: "Either productUrl or asin is required",
	})
	.refine(
		(data) => {
			const wallet = data.walletAddress;
			// EVM address: 0x + 40 hex chars
			const isEvm = /^0x[a-fA-F0-9]{40}$/.test(wallet);
			// Solana address: 32-44 base58 chars
			const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet);
			return isEvm || isSolana;
		},
		{
			message: "Invalid wallet address. Must be Solana (base58) or EVM (0x...)",
			path: ["walletAddress"],
		},
	)
	.openapi("BuyRequest");

export const BuyResponseSchema = z
	.object({
		orderId: z.string().openapi({
			example: "550e8400-e29b-41d4-a716-446655440000",
		}),
		status: z.string().openapi({
			example: "awaiting-payment",
		}),
		serializedTransaction: z.string().openapi({
			description: "Base64 encoded Solana transaction for signing",
		}),
		product: z.object({
			title: z.string().optional(),
			imageUrl: z.string().url().optional(),
			price: z
				.object({
					amount: z.string(),
					currency: z.string(),
				})
				.optional(),
		}),
		totalPrice: z.object({
			amount: z.string().openapi({ example: "84.99" }),
			currency: z.string().openapi({ example: "USD" }),
		}),
		checkoutUrl: z.string().url().openapi({
			example: "https://www.crossmint.com/checkout/abc123",
			description: "Fallback URL to complete payment in browser",
		}),
	})
	.openapi("BuyResponse");

export type BuyRequest = z.infer<typeof BuyRequestSchema>;
export type BuyResponse = z.infer<typeof BuyResponseSchema>;
