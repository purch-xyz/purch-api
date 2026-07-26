import { z } from "zod";

const envSchema = z.object({
	PORT: z.coerce.number().default(8080),
	PURCH_BACKEND_URL: z.string().url(),
	PURCH_BACKEND_AUDIENCE: z.string().url().optional(),
	X402_PAYTO_ADDRESS: z.string().min(32),
	X402_CDP_API_KEY_ID: z.string().min(1),
	X402_CDP_API_KEY_SECRET: z.string().min(1),
	ORDER_TREASURY_WALLET: z.string().min(32),
	TRACK17_API_KEY: z.string().min(1),
	/** Override only for tests against a stub. Defaults to the live v2.4 API. */
	TRACK17_BASE_URL: z.string().url().default("https://api.17track.net/track/v2.4"),
	SLACK_WEBHOOK_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("❌ Invalid environment variables:");
	console.error(parsed.error.flatten().fieldErrors);
	process.exit(1);
}

export const env = parsed.data;
