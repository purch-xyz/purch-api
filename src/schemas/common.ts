import { z } from "@hono/zod-openapi";

export const ProductSchema = z
	.object({
		asin: z.string().openapi({ example: "B0CXYZ1234" }),
		title: z.string().openapi({ example: "Wireless Bluetooth Headphones" }),
		price: z.number().nullable().openapi({ example: 79.99 }),
		currency: z.string().openapi({ example: "USD" }),
		rating: z.number().nullable().openapi({ example: 4.5 }),
		reviewCount: z.number().nullable().openapi({ example: 1250 }),
		imageUrl: z.string().url().nullable().openapi({
			example: "https://m.media-amazon.com/images/I/example.jpg",
		}),
		productUrl: z.string().url().nullable().openapi({
			example: "https://amazon.com/dp/B0CXYZ1234",
		}),
		source: z.enum(["amazon", "shopify"]).openapi({ example: "amazon" }),
	})
	.openapi("Product");

export const ShippingAddressSchema = z
	.object({
		name: z.string().min(1).openapi({ example: "John Doe" }),
		line1: z.string().min(1).openapi({ example: "123 Main Street" }),
		line2: z.string().optional().openapi({ example: "Apt 4B" }),
		city: z.string().min(1).openapi({ example: "San Francisco" }),
		state: z.string().min(1).openapi({ example: "CA" }),
		postalCode: z.string().min(1).openapi({ example: "94102" }),
		country: z.string().length(2).openapi({ example: "US", description: "ISO 3166-1 alpha-2" }),
		phone: z.string().optional().openapi({ example: "+1-555-123-4567" }),
	})
	.openapi("ShippingAddress");

export const ApiErrorSchema = z
	.object({
		code: z.string().openapi({ example: "VALIDATION_ERROR" }),
		message: z.string().openapi({ example: "Invalid request parameters" }),
		details: z.record(z.unknown()).optional(),
	})
	.openapi("ApiError");
