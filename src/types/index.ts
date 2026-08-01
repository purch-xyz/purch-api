export interface Product {
	asin: string;
	title: string;
	price: number | null;
	currency: string;
	rating: number | null;
	reviewCount: number | null;
	imageUrl: string | null;
	productUrl: string | null;
	source: "amazon" | "shopify";
}

export interface SearchFilters {
	priceMin?: number;
	priceMax?: number;
	brand?: string;
	page?: number;
}

export interface ShopResponse {
	message: string;
	products: Product[];
}

export interface BuyOrder {
	orderId: string;
	status: "pending" | "processing" | "completed" | "failed";
	product: Product;
	shippingAddress: ShippingAddress;
	totalPrice: number;
	currency: string;
	checkoutUrl: string;
}

export interface ShippingAddress {
	name: string;
	line1: string;
	line2?: string;
	city: string;
	state: string;
	postalCode: string;
	country: string;
	phone?: string;
}

export interface ApiError {
	code: string;
	message: string;
	details?: Record<string, unknown>;
}

export interface TrackingEvent {
	time: string | null;
	description: string | null;
	location: string | null;
	stage: string | null;
}

/** 17TRACK's nine normalized shipment statuses. */
export const TRACK_STATUSES = [
	"NotFound",
	"InfoReceived",
	"InTransit",
	"Expired",
	"AvailableForPickup",
	"OutForDelivery",
	"DeliveryFailure",
	"Delivered",
	"Exception",
] as const;

export type TrackStatus = (typeof TRACK_STATUSES)[number];

/** 17TRACK's nine milestone key stages, in the order they normally occur. */
export const TRACK_MILESTONE_STAGES = [
	"InfoReceived",
	"PickedUp",
	"Departure",
	"Arrival",
	"AvailableForPickup",
	"OutForDelivery",
	"Delivered",
	"Returning",
	"Returned",
] as const;

export interface TrackMilestone {
	stage: string;
	time: string | null;
}

export interface TrackResult {
	number: string;
	status: TrackStatus;
	subStatus: string | null;
	/** Carrier-supplied elaboration on the sub-status, when present. */
	statusDescription: string | null;
	delivered: boolean;
	found: boolean;
	carrier: {
		code: number | null;
		name: string | null;
		homepage: string | null;
		country: string | null;
	};
	/** Final-mile carrier, populated for postal handoffs (e.g. China Post → USPS). */
	lastMileCarrier: { code: number | null; name: string | null } | null;
	origin: string | null;
	destination: string | null;
	latestEvent: TrackingEvent | null;
	events: TrackingEvent[];
	/** Only the stages the package has actually reached, in shipping order. */
	milestones: TrackMilestone[];
	pickedUpAt: string | null;
	deliveredAt: string | null;
	daysInTransit: number | null;
	daysSinceLastUpdate: number | null;
	estimatedDelivery: {
		from: string | null;
		to: string | null;
		/** "Official" (carrier), "17TRACK" (estimated), or null. */
		source: string | null;
	} | null;
	serviceType: string | null;
	weightKg: string | null;
	/** Official carrier notice, e.g. an explanation for a tracking problem (v2.4). */
	carrierNotice: string | null;
	trackingPageUrl: string;
}
