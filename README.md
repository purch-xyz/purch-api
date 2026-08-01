# Purch API

Public x402 API for Purch — lets AI agents search and buy products on Amazon and Shopify, and track shipments across 3,400+ carriers. Every endpoint is payable via the [x402 protocol](https://www.x402.org) with USDC on Solana. No API keys, no signups — payment is the authentication.

## 📊 Live x402 Metrics

[![x402scan](https://img.shields.io/badge/x402scan-live_metrics-2563eb?logo=solana&logoColor=white)](https://www.x402scan.com/server/ad1c686d-5f67-4160-ad50-72175071d9a7)
[![Transactions](https://img.shields.io/badge/transactions-460%2B-blue)](https://www.x402scan.com/server/ad1c686d-5f67-4160-ad50-72175071d9a7)
[![Volume](https://img.shields.io/badge/volume-%241.38k%2B-blue)](https://www.x402scan.com/server/ad1c686d-5f67-4160-ad50-72175071d9a7)
[![Buyers](https://img.shields.io/badge/buyers-93%2B-blue)](https://www.x402scan.com/server/ad1c686d-5f67-4160-ad50-72175071d9a7)

All-time snapshot as of August 2026 — see the live numbers, charts, and resource pricing on [x402scan](https://www.x402scan.com/server/ad1c686d-5f67-4160-ad50-72175071d9a7).

## Endpoints

| Method | Endpoint | Price | Description |
|--------|----------|-------|-------------|
| `GET` | `/x402/search` | $0.01 | Structured product search with filters |
| `POST` | `/x402/shop` | $0.10 | Natural language AI shopping assistant |
| `POST` | `/x402/buy` | dynamic | Buy a product — price equals the product total |
| `GET` | `/x402/track` | $0.52 | Track any shipment by tracking number (3,400+ carriers) |

Interactive docs at [api.purch.xyz/docs](https://api.purch.xyz/docs) · OpenAPI spec at [api.purch.xyz/openapi.json](https://api.purch.xyz/openapi.json) · Discovery at `/.well-known/x402`.

## Payment

The first request to any endpoint returns a `402 Payment Required` response with payment details; an x402-capable client (e.g. `@x402/fetch`) pays in USDC on Solana and retries automatically.

```bash
# Returns 402 with payment instructions
curl "https://api.purch.xyz/x402/search?q=wireless+headphones"
```

```ts
import { wrapFetchWithPayment } from "@x402/fetch";

const fetchWithPay = wrapFetchWithPayment(fetch, signer);
const res = await fetchWithPay("https://api.purch.xyz/x402/search?q=wireless+headphones");
```

### One-Command Checkout

```bash
curl -X POST "https://api.purch.xyz/x402/buy" \
  -H "Content-Type: application/json" \
  -d '{
    "asin": "B0CXYZ1234",
    "email": "john@example.com",
    "shippingAddress": {
      "name": "John Doe",
      "line1": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postalCode": "94102",
      "country": "US"
    }
  }'
```

The 402 quote equals the full product total (including tax and shipping). Once paid, Purch places the order and returns the order id and status.

## Links

- [Purch](https://purch.xyz) — AI shopping concierge
- [Docs](https://docs.purch.xyz)
- [x402scan metrics](https://www.x402scan.com/server/ad1c686d-5f67-4160-ad50-72175071d9a7)
