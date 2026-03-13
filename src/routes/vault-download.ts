import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { ApiErrorSchema, PaymentRequiredSchema } from "../schemas/common.js";
import { VaultDownloadQuerySchema } from "../schemas/vault.js";
import { purchClient } from "../services/purch.js";

export const vaultDownloadRouter = new OpenAPIHono();

const vaultDownloadRoute = createRoute({
	method: "get",
	path: "/:purchaseId",
	tags: ["Vault"],
	summary: "Download purchased vault item",
	description: `Download the file for a vault purchase. Automatically verifies on-chain payment if not yet verified, triggers creator payout, then streams the ZIP file.

For purchases created via \`POST /x402/vault/buy\`, payment is already settled, so call this endpoint with the \`downloadToken\` only.

For purchases created via \`POST /vault/buy\`, wait for \`finalized\` confirmation, then call this endpoint with the \`downloadToken\` and the on-chain \`txSignature\` from the submitted transaction.

**Note:** Each call costs $0.01 via x402, including re-downloads.`,
	request: {
		params: z.object({
			purchaseId: z
				.string()
				.uuid()
				.openapi({
					param: { name: "purchaseId", in: "path" },
					example: "550e8400-e29b-41d4-a716-446655440000",
				}),
		}),
		query: VaultDownloadQuerySchema,
	},
	responses: {
		200: {
			description: "File download (ZIP)",
			content: {
				"application/octet-stream": {
					schema: z.string().openapi({ format: "binary" }),
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
		403: {
			description: "Not authorized",
			content: {
				"application/json": {
					schema: ApiErrorSchema,
				},
			},
		},
		404: {
			description: "Purchase not found or file unavailable",
			content: {
				"application/json": {
					schema: ApiErrorSchema,
				},
			},
		},
	},
});

vaultDownloadRouter.openapi(vaultDownloadRoute, async (c) => {
	const { purchaseId } = c.req.valid("param");
	const { downloadToken, txSignature } = c.req.valid("query");

	const response = await purchClient.vaultDownload(
		purchaseId,
		downloadToken,
		txSignature ?? undefined,
	);

	// Stream the file through to the client
	return new Response(response.body, {
		headers: {
			"Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
			"Content-Disposition": response.headers.get("Content-Disposition") ?? "attachment",
			...(response.headers.get("Content-Length")
				? { "Content-Length": response.headers.get("Content-Length")! }
				: {}),
		},
	});
});
