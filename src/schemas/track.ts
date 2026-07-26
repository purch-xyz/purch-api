import { z } from "@hono/zod-openapi";
import { TRACK_STATUSES } from "../types/index.js";

export const TrackQuerySchema = z.object({
	number: z
		.string()
		.min(5)
		.max(50)
		// 17TRACK's format: 5-50 consecutive letters, numbers and/or hyphens.
		.regex(/^[A-Za-z0-9-]+$/, "Tracking numbers may contain only letters, numbers and hyphens")
		.openapi({
			param: { name: "number", in: "query" },
			example: "1ZA1234E0205271688",
			description: "Tracking number from any of 3,400+ supported carriers",
		}),
	carrier: z.coerce
		.number()
		.int()
		.positive()
		.optional()
		.openapi({
			param: { name: "carrier", in: "query" },
			example: 100002,
			description:
				"Optional 17TRACK numeric carrier code. Omit it and the carrier is auto-detected — only supply it for ambiguous numbers, or after a CARRIER_NOT_DETECTED response. Codes: https://res.17track.net/asset/carrier/info/apicarrier.all.json",
		}),
	destinationPostalCode: z
		.string()
		.max(20)
		.optional()
		.openapi({
			param: { name: "destinationPostalCode", in: "query" },
			example: "94102",
			description: "Only needed if a lookup returns ADDITIONAL_FIELD_REQUIRED naming a postal code",
		}),
	destinationCountry: z
		.string()
		.length(2)
		.optional()
		.openapi({
			param: { name: "destinationCountry", in: "query" },
			example: "US",
			description: "ISO 3166-1 alpha-2. Paired with destinationPostalCode by some carriers.",
		}),
	shipDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.openapi({
			param: { name: "shipDate", in: "query" },
			example: "2026-07-14",
			description:
				"Ship date (YYYY-MM-DD). Only needed if a lookup returns ADDITIONAL_FIELD_REQUIRED naming a date.",
		}),
	phone: z
		.string()
		.max(30)
		.optional()
		.openapi({
			param: { name: "phone", in: "query" },
			example: "+15551234567",
			description:
				"Only needed if a lookup returns ADDITIONAL_FIELD_REQUIRED naming a phone number",
		}),
	cpfOrCnpj: z
		.string()
		.max(20)
		.optional()
		.openapi({
			param: { name: "cpfOrCnpj", in: "query" },
			example: "12345678901",
			description: "Brazilian CPF/CNPJ, required by some Brazilian carriers",
		}),
});

const TrackingEventSchema = z
	.object({
		time: z.string().nullable().openapi({
			example: "2026-07-20T14:32:00-07:00",
			description: "ISO 8601 with the carrier's local offset",
		}),
		description: z.string().nullable().openapi({ example: "Arrived at facility" }),
		location: z.string().nullable().openapi({ example: "OAKLAND, CA, US" }),
		stage: z.string().nullable().openapi({ example: "InTransit" }),
	})
	.openapi("TrackingEvent");

const TrackMilestoneSchema = z
	.object({
		stage: z.string().openapi({
			example: "PickedUp",
			description:
				"One of InfoReceived, PickedUp, Departure, Arrival, AvailableForPickup, OutForDelivery, Delivered, Returning, Returned",
		}),
		time: z.string().nullable().openapi({ example: "2026-07-15T08:46:00-05:00" }),
	})
	.openapi("TrackMilestone");

export const TrackResponseSchema = z
	.object({
		number: z.string().openapi({ example: "1ZA1234E0205271688" }),
		status: z
			.enum(TRACK_STATUSES)
			.openapi({ example: "InTransit", description: "Normalized shipment status" }),
		subStatus: z.string().nullable().openapi({ example: "InTransit_CustomsProcessing" }),
		statusDescription: z.string().nullable().openapi({
			example: null,
			description: "Carrier elaboration on the sub-status, when provided",
		}),
		delivered: z.boolean().openapi({ example: false }),
		found: z
			.boolean()
			.openapi({ example: true, description: "False when no carrier data exists yet" }),
		carrier: z
			.object({
				code: z.number().nullable().openapi({ example: 100002 }),
				name: z.string().nullable().openapi({ example: "UPS" }),
				homepage: z.string().nullable().openapi({ example: "https://www.ups.com" }),
				country: z.string().nullable().openapi({ example: "US" }),
			})
			.openapi("TrackCarrier"),
		lastMileCarrier: z
			.object({
				code: z.number().nullable().openapi({ example: 21051 }),
				name: z.string().nullable().openapi({ example: "USPS" }),
			})
			.nullable()
			.openapi({ description: "Final-mile carrier on postal handoffs, else null" }),
		origin: z.string().nullable().openapi({ example: "CN", description: "ISO 3166-1 alpha-2" }),
		destination: z.string().nullable().openapi({ example: "US" }),
		latestEvent: TrackingEventSchema.nullable(),
		events: z
			.array(TrackingEventSchema)
			.openapi({ description: "Full history, newest first, deduped across carriers" }),
		milestones: z
			.array(TrackMilestoneSchema)
			.openapi({ description: "Stages the package has reached, in shipping order" }),
		pickedUpAt: z.string().nullable().openapi({ example: "2026-07-15T08:46:00-05:00" }),
		deliveredAt: z.string().nullable().openapi({ example: null }),
		daysInTransit: z.number().nullable().openapi({ example: 6 }),
		daysSinceLastUpdate: z.number().nullable().openapi({
			example: 1,
			description: "Days since the carrier last reported — use to judge staleness",
		}),
		estimatedDelivery: z
			.object({
				from: z.string().nullable().openapi({ example: "2026-07-28T08:00:00-05:00" }),
				to: z.string().nullable().openapi({ example: "2026-07-30T13:00:00-05:00" }),
				source: z.string().nullable().openapi({
					example: "Official",
					description: '"Official" (from the carrier) or "17TRACK" (estimated)',
				}),
			})
			.nullable(),
		serviceType: z.string().nullable().openapi({ example: "UPS Worldwide Express" }),
		weightKg: z.string().nullable().openapi({ example: "1.1" }),
		carrierNotice: z.string().nullable().openapi({
			example: null,
			description: "Official carrier notice, often explaining a tracking problem",
		}),
		trackingPageUrl: z.string().openapi({
			example: "https://t.17track.net/en#nums=1ZA1234E0205271688",
			description: "Human-readable tracking page for the same number",
		}),
	})
	.openapi("TrackResult");
