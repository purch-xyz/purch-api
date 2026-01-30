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
