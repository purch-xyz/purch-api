import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { ApiError } from "../types/index.js";

export function errorHandler(err: Error, c: Context) {
	console.error(`[${new Date().toISOString()}] Error:`, err);

	if (err instanceof HTTPException) {
		return c.json<ApiError>(
			{
				code: `HTTP_${err.status}`,
				message: err.message,
			},
			err.status,
		);
	}

	if (err instanceof ZodError) {
		return c.json<ApiError>(
			{
				code: "VALIDATION_ERROR",
				message: "Invalid request parameters",
				details: err.flatten().fieldErrors,
			},
			400,
		);
	}

	return c.json<ApiError>(
		{
			code: "INTERNAL_ERROR",
			message: "An unexpected error occurred",
		},
		500,
	);
}
