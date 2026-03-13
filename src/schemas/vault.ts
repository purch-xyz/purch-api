import { z } from "@hono/zod-openapi";

// --- Vault Item Schema ---

const VaultCreatorSchema = z
	.object({
		name: z.string().openapi({ example: "John Doe" }),
		type: z.enum(["human", "agent"]).openapi({ example: "human" }),
		avatarUrl: z.string().url().nullable().optional().openapi({
			example: "https://example.com/avatar.jpg",
		}),
	})
	.openapi("VaultCreator");

const VaultBoostSchema = z
	.object({
		active: z.boolean(),
		expiresAt: z.string(),
	})
	.nullable()
	.openapi("VaultBoost");

export const VaultItemSchema = z
	.object({
		id: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
		productType: z.enum(["skill", "knowledge", "persona"]).openapi({ example: "skill" }),
		slug: z.string().openapi({ example: "marketing-automation-pro" }),
		title: z.string().openapi({ example: "Marketing Automation Pro" }),
		cardDescription: z.string().openapi({
			example: "Automate your entire marketing workflow with AI-powered campaigns",
		}),
		price: z.number().openapi({ example: 5, description: "Price in USDC (whole units)" }),
		category: z.string().openapi({ example: "marketing" }),
		coverImageUrl: z.string().url().nullable().openapi({
			example: "https://example.com/cover.jpg",
		}),
		creator: VaultCreatorSchema,
		createdAt: z.string().openapi({ example: "2025-01-15T10:30:00.000Z" }),
		downloads: z.number().openapi({ example: 150 }),
		featured: z.boolean().openapi({ example: false }),
		boost: VaultBoostSchema.optional(),
	})
	.openapi("VaultItem");

export const VaultItemDetailSchema = VaultItemSchema.extend({
	tagline: z.string().nullable().openapi({ example: "The ultimate marketing toolkit" }),
	originalPrice: z.number().nullable().openapi({ example: 10 }),
	discountPercent: z.number().nullable().openapi({ example: 50 }),
	galleryImages: z.array(z.string().url()).openapi({
		example: ["https://example.com/gallery1.jpg"],
	}),
	purchaseSubtitle: z.string().nullable().optional(),
	purchaseHighlights: z.array(z.object({ icon: z.string(), text: z.string() })).optional(),
	detailHeading: z.string().nullable().optional(),
	detailSubheading: z.string().nullable().optional(),
	features: z.array(z.string()).optional(),
	includedItems: z
		.array(z.object({ title: z.string(), description: z.string(), color: z.string() }))
		.optional(),
	includedSubtitle: z.string().nullable().optional(),
	faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
}).openapi("VaultItemDetail");

// --- Search ---

export const VaultSearchQuerySchema = z.object({
	q: z
		.string()
		.optional()
		.openapi({
			param: { name: "q", in: "query" },
			example: "marketing automation",
			description: "Search query",
		}),
	category: z
		.enum(["marketing", "development", "automation", "career", "ios", "productivity"])
		.optional()
		.openapi({
			param: { name: "category", in: "query" },
			example: "marketing",
			description: "Filter by category",
		}),
	productType: z
		.enum(["skill", "knowledge", "persona"])
		.optional()
		.openapi({
			param: { name: "productType", in: "query" },
			example: "skill",
			description: "Filter by product type",
		}),
	minPrice: z.coerce
		.number()
		.int()
		.min(0)
		.optional()
		.openapi({
			param: { name: "minPrice", in: "query" },
			example: 0,
			description: "Minimum price in USDC (whole units)",
		}),
	maxPrice: z.coerce
		.number()
		.int()
		.min(0)
		.optional()
		.openapi({
			param: { name: "maxPrice", in: "query" },
			example: 100,
			description: "Maximum price in USDC (whole units)",
		}),
	cursor: z
		.string()
		.uuid()
		.optional()
		.openapi({
			param: { name: "cursor", in: "query" },
			description: "Pagination cursor (UUID of last item)",
		}),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(100)
		.default(30)
		.openapi({
			param: { name: "limit", in: "query" },
			example: 30,
			description: "Number of items per page (max 100)",
		}),
});

export const VaultSearchResponseSchema = z
	.object({
		items: z.array(VaultItemSchema),
		nextCursor: z.string().uuid().nullable().openapi({
			example: "550e8400-e29b-41d4-a716-446655440000",
			description: "Cursor for next page, null if no more results",
		}),
	})
	.openapi("VaultSearchResponse");

// --- Buy ---

export const VaultBuyRequestSchema = z
	.object({
		slug: z.string().min(1).openapi({
			example: "marketing-automation-pro",
			description: "Vault item slug to purchase",
		}),
		walletAddress: z.string().openapi({
			example: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
			description: "Solana wallet address (base58) to pay from",
		}),
		email: z.string().email().openapi({
			example: "agent@example.com",
			description: "Email for purchase confirmation and download access",
		}),
	})
	.refine((data) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(data.walletAddress), {
		message: "Invalid Solana wallet address (must be base58)",
		path: ["walletAddress"],
	})
	.openapi("VaultBuyRequest");

export const VaultBuyResponseSchema = z
	.object({
		purchaseId: z.string().uuid().openapi({
			example: "550e8400-e29b-41d4-a716-446655440000",
			description: "Purchase intent ID — use this for the download endpoint",
		}),
		downloadToken: z.string().openapi({
			example: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			description:
				"Secret token for downloading the file. Pass as query param to the download endpoint.",
		}),
		serializedTransaction: z.string().openapi({
			description: "Base64-encoded Solana VersionedTransaction. Sign and submit on-chain.",
		}),
		blockhash: z.string().openapi({
			description: "Recent blockhash used in the transaction",
		}),
		lastValidBlockHeight: z.number().openapi({
			description: "Block height after which the transaction expires",
		}),
		item: z
			.object({
				slug: z.string(),
				title: z.string(),
				productType: z.enum(["skill", "knowledge", "persona"]),
				price: z.number().openapi({ description: "Price in USDC (whole units)" }),
				coverImageUrl: z.string().url().nullable(),
			})
			.nullable(),
		payment: z.object({
			amountMicroUsdc: z.string().openapi({
				example: "4990000",
				description: "Amount in micro-USDC",
			}),
			amountUsdc: z.string().openapi({
				example: "4.99",
				description: "Amount in USDC (human-readable)",
			}),
			network: z.literal("solana").openapi({ example: "solana" }),
		}),
	})
	.openapi("VaultBuyResponse");

// --- Download ---

export const VaultDownloadQuerySchema = z.object({
	downloadToken: z
		.string()
		.regex(/^[a-f0-9]{64}$/, "Invalid download token")
		.openapi({
			param: { name: "downloadToken", in: "query" },
			example: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
			description: "Secret download token received from the buy response",
		}),
	txSignature: z
		.string()
		.optional()
		.openapi({
			param: { name: "txSignature", in: "query" },
			example: "5wHu1qwD7q8ZQ...",
			description:
				"On-chain transaction signature. Required for first download (triggers verification). Optional for re-downloads.",
		}),
});

/**
 * x402 vault buy request — same fields, walletAddress still needed for purchase record.
 */
export const X402VaultBuyRequestSchema = z
	.object({
		slug: z.string().min(1).openapi({
			example: "marketing-automation-pro",
			description: "Vault item slug to purchase",
		}),
		walletAddress: z.string().openapi({
			example: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
			description: "Solana wallet address (base58) for purchase record",
		}),
		email: z.string().email().openapi({
			example: "agent@example.com",
			description: "Email for purchase confirmation and download access",
		}),
	})
	.refine((data) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(data.walletAddress), {
		message: "Invalid Solana wallet address (must be base58)",
		path: ["walletAddress"],
	})
	.openapi("X402VaultBuyRequest");

/**
 * x402 vault buy response — no serialized transaction, purchase already complete.
 */
export const X402VaultBuyResponseSchema = z
	.object({
		purchaseId: z.string().uuid().openapi({
			example: "550e8400-e29b-41d4-a716-446655440000",
			description: "Purchase ID — use this for the download endpoint",
		}),
		downloadToken: z.string().openapi({
			example: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			description: "Secret token for downloading the file",
		}),
		item: z
			.object({
				slug: z.string(),
				title: z.string(),
				productType: z.enum(["skill", "knowledge", "persona"]),
				price: z.number().openapi({ description: "Price in USDC (whole units)" }),
				coverImageUrl: z.string().url().nullable(),
			})
			.nullable(),
	})
	.openapi("X402VaultBuyResponse");

export type VaultSearchQuery = z.infer<typeof VaultSearchQuerySchema>;
export type VaultSearchResponse = z.infer<typeof VaultSearchResponseSchema>;
export type VaultBuyRequest = z.infer<typeof VaultBuyRequestSchema>;
export type VaultBuyResponse = z.infer<typeof VaultBuyResponseSchema>;
export type X402VaultBuyRequest = z.infer<typeof X402VaultBuyRequestSchema>;
export type X402VaultBuyResponse = z.infer<typeof X402VaultBuyResponseSchema>;
