import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { ApiErrorSchema, PaymentRequiredSchema } from "../schemas/common.js";
import { VaultBuyRequestSchema, VaultBuyResponseSchema } from "../schemas/vault.js";
import { purchClient } from "../services/purch.js";

export const vaultBuyRouter = new OpenAPIHono();

const vaultBuyRoute = createRoute({
	method: "post",
	path: "/",
	tags: ["Vault"],
	summary: "Buy a vault item",
	description: `Initiate a vault item purchase and get a serialized Solana transaction to sign.

## Flow
1. Call this endpoint with the item \`slug\`, your \`walletAddress\`, and \`email\`
2. Receive a \`serializedTransaction\`, \`purchaseId\`, and \`downloadToken\`
3. Deserialize, sign, submit the transaction, and wait for \`finalized\` confirmation
4. Download via \`GET /x402/vault/download/:purchaseId?downloadToken=...&txSignature=...\` (auto-verifies payment)`,
	request: {
		body: {
			content: {
				"application/json": {
					schema: VaultBuyRequestSchema,
				},
			},
			required: true,
		},
	},
	responses: {
		200: {
			description: "Purchase intent with serialized transaction",
			content: {
				"application/json": {
					schema: VaultBuyResponseSchema,
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

vaultBuyRouter.openapi(vaultBuyRoute, async (c) => {
	const body = c.req.valid("json");

	const result = await purchClient.vaultBuy({
		slug: body.slug,
		walletAddress: body.walletAddress,
		email: body.email,
	});

	return c.json(result, 200);
});
