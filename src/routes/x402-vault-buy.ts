import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { ApiErrorSchema, PaymentRequiredSchema } from "../schemas/common.js";
import { X402VaultBuyRequestSchema, X402VaultBuyResponseSchema } from "../schemas/vault.js";
import { purchClient } from "../services/purch.js";

export const x402VaultBuyRouter = new OpenAPIHono();

const x402VaultBuyRoute = createRoute({
	method: "post",
	path: "/",
	tags: ["Vault"],
	summary: "Buy a vault item (x402 dynamic pricing)",
	description: `Purchase a vault item with x402 dynamic pricing. The x402 payment amount equals the item's price in USDC.

## How it works
1. Send your request — you'll receive a 402 response with the item price
2. Your x402 client handles payment automatically (USDC on Solana)
3. On successful payment, receive \`purchaseId\` and \`downloadToken\`
4. Download via \`GET /x402/vault/download/:purchaseId?downloadToken=...\` (no txSignature needed)`,
	request: {
		body: {
			content: {
				"application/json": {
					schema: X402VaultBuyRequestSchema,
				},
			},
			required: true,
		},
	},
	responses: {
		200: {
			description: "Purchase complete — use purchaseId and downloadToken to download",
			content: {
				"application/json": {
					schema: X402VaultBuyResponseSchema,
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
			description: "Payment Required — price equals the item price in USDC",
			content: {
				"application/json": {
					schema: PaymentRequiredSchema,
				},
			},
		},
		404: {
			description: "Item not found",
			content: {
				"application/json": {
					schema: ApiErrorSchema,
				},
			},
		},
	},
});

x402VaultBuyRouter.openapi(x402VaultBuyRoute, async (c) => {
	const body = c.req.valid("json");

	// x402 payment already settled — create purchase and mark as verified
	// We pass a placeholder tx signature; the real x402 settlement tx is in the response headers
	const result = await purchClient.vaultBuyX402({
		slug: body.slug,
		walletAddress: body.walletAddress,
		email: body.email,
		x402TxSignature: "x402-settlement", // x402 facilitator handles the actual settlement
	});

	return c.json(
		{
			purchaseId: result.purchaseId,
			downloadToken: result.downloadToken,
			item: result.item
				? {
						...result.item,
						productType: result.item.productType as "skill" | "knowledge" | "persona",
					}
				: null,
		},
		200,
	);
});
