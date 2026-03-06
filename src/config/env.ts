import { z } from "zod";

const envSchema = z.object({
	PORT: z.coerce.number().default(8080),
	PURCH_BACKEND_URL: z.string().url(),
	PURCH_INTERNAL_API_KEY: z.string().min(1),
	X402_PAYTO_ADDRESS: z.string().min(32),
	X402_CDP_API_KEY_ID: z.string().min(1),
	X402_CDP_API_KEY_SECRET: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("❌ Invalid environment variables:");
	console.error(parsed.error.flatten().fieldErrors);
	process.exit(1);
}

export const env = parsed.data;
