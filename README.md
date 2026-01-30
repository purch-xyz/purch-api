# @purch/api

Public API for Purch - AI-powered shopping assistant.

## Quick Start

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start development server
bun dev
```

The server starts at `http://localhost:8080` with interactive docs at `/docs`.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/search` | Structured product search with filters |
| `POST` | `/shop` | Natural language AI shopping assistant |
| `POST` | `/buy` | Create a purchase order |
| `GET` | `/buy/:orderId` | Check order status |

## Authentication

All endpoints require an API key:

```bash
curl -H "Authorization: Bearer pk_live_xxx" https://api.purch.ing/search?q=headphones
```

## Examples

### Search Products

```bash
curl "https://api.purch.ing/search?q=wireless+headphones&priceMax=100" \
  -H "Authorization: Bearer $API_KEY"
```

### AI Shopping Assistant

```bash
curl -X POST "https://api.purch.ing/shop" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need comfortable running shoes under $150 with good arch support"
  }'
```

### One-Command Checkout

```bash
curl -X POST "https://api.purch.ing/buy" \
  -H "Authorization: Bearer $API_KEY" \
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

## Development

```bash
bun dev          # Start with hot reload
bun lint         # Check code style
bun lint:fix     # Auto-fix issues
bun typecheck    # TypeScript validation
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 8080) |
| `PURCH_BACKEND_URL` | Purch backend API URL |
| `PURCH_INTERNAL_API_KEY` | Internal API key for backend |
| `API_KEYS` | Comma-separated list of valid API keys |
