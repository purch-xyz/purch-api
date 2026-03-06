import { app } from "./app.js";
import { env } from "./config/env.js";

console.log(`
┌─────────────────────────────────────────┐
│                                         │
│   🛒 Purch API                          │
│                                         │
│   Server:  http://localhost:${env.PORT}        │
│   Docs:    http://localhost:${env.PORT}/docs   │
│   OpenAPI: http://localhost:${env.PORT}/openapi.json │
│   x402:    Coinbase CDP facilitator     │
│                                         │
└─────────────────────────────────────────┘
`);

export default {
	port: env.PORT,
	fetch: app.fetch,
};
