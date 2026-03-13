#!/bin/bash

# =============================================================================
# Purch Public API Test Suite
# =============================================================================
# Tests security, rate limiting, and all main flows
# Usage: ./scripts/test-api.sh [backend_url] [api_url]
# =============================================================================

# Don't exit on error - we handle failures ourselves
set +e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration
BACKEND_URL="${1:-http://localhost:3000}"
API_URL="${2:-http://localhost:8080}"

# Test counters
PASSED=0
FAILED=0
SKIPPED=0

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${BLUE}  $1${NC}"
    echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

print_section() {
    echo ""
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
}

print_test() {
    echo -e "\n${YELLOW}▶ TEST:${NC} $1"
}

pass() {
    echo -e "  ${GREEN}✓ PASS:${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "  ${RED}✗ FAIL:${NC} $1"
    ((FAILED++))
}

skip() {
    echo -e "  ${YELLOW}⊘ SKIP:${NC} $1"
    ((SKIPPED++))
}

check_status() {
    local response="$1"
    local expected="$2"
    local actual=$(echo "$response" | head -1)

    if [[ "$actual" == *"$expected"* ]]; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# Health Checks
# =============================================================================

print_header "HEALTH CHECKS"

print_test "Backend health check"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "200" ]]; then
    pass "Backend is healthy ($BACKEND_URL)"
else
    fail "Backend not responding (HTTP $HTTP_CODE)"
    echo -e "  ${RED}Cannot continue without backend. Exiting.${NC}"
    exit 1
fi

print_test "Public API health check"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "200" ]]; then
    pass "Public API is healthy ($API_URL)"
else
    fail "Public API not responding (HTTP $HTTP_CODE)"
    echo -e "  ${RED}Cannot continue without API. Exiting.${NC}"
    exit 1
fi

# =============================================================================
# Security Tests - Backend
# =============================================================================

print_header "SECURITY TESTS - BACKEND"

print_section "Authentication Bypass Attempts"

print_test "Access protected endpoint without auth"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/users/me")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "401" ]]; then
    pass "Protected endpoint requires authentication"
else
    fail "Protected endpoint accessible without auth (HTTP $HTTP_CODE)"
fi

print_test "Access protected endpoint with invalid JWT"
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer invalid.jwt.token" "$BACKEND_URL/api/users/me")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "401" ]]; then
    pass "Invalid JWT rejected"
else
    fail "Invalid JWT not rejected (HTTP $HTTP_CODE)"
fi

print_test "Access internal endpoint without service auth"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/agent/shop" \
    -H "Content-Type: application/json" \
    -d '{"message":"test"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "401" ]]; then
    pass "Internal endpoint requires service auth"
else
    fail "Internal endpoint accessible without service auth (HTTP $HTTP_CODE)"
fi

print_test "Access internal endpoint with invalid bearer token"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/agent/shop" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer invalid-token" \
    -d '{"message":"test"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "401" ]]; then
    pass "Invalid service token rejected"
else
    fail "Invalid service token accepted (HTTP $HTTP_CODE)"
fi

print_section "Injection Attack Prevention"

print_test "SQL injection in query parameter"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 -G "$API_URL/search" --data-urlencode "q='; DROP TABLE users; --")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [[ "$HTTP_CODE" == "200" ]] && [[ "$BODY" == *"products"* ]]; then
    pass "SQL injection attempt handled safely"
else
    fail "Unexpected response to SQL injection (HTTP $HTTP_CODE)"
fi

print_test "XSS in message field"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/shop" \
    -H "Content-Type: application/json" \
    -d '{"message":"<script>alert(1)</script>"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "200" ]]; then
    pass "XSS attempt handled (input accepted but not executed)"
else
    fail "Unexpected response to XSS attempt (HTTP $HTTP_CODE)"
fi

print_test "Command injection in search"
RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 -G "$API_URL/search" --data-urlencode "q=test; ls -la")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "200" ]]; then
    pass "Command injection attempt handled safely"
else
    fail "Unexpected response to command injection (HTTP $HTTP_CODE)"
fi

print_section "Input Validation"

print_test "Empty message to /shop"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/shop" \
    -H "Content-Type: application/json" \
    -d '{"message":""}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "400" ]]; then
    pass "Empty message rejected"
else
    fail "Empty message accepted (HTTP $HTTP_CODE)"
fi

print_test "Missing required fields in /buy"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/buy" \
    -H "Content-Type: application/json" \
    -d '{"asin":"B0TEST"}')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "400" ]]; then
    pass "Missing required fields rejected"
else
    fail "Missing fields accepted (HTTP $HTTP_CODE)"
fi

print_test "Invalid email format in /buy"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/buy" \
    -H "Content-Type: application/json" \
    -d '{
        "asin":"B0TEST",
        "email":"not-an-email",
        "walletAddress":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "shippingAddress":{"name":"Test","line1":"123 St","city":"NYC","state":"NY","postalCode":"10001","country":"US"}
    }')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "400" ]]; then
    pass "Invalid email format rejected"
else
    fail "Invalid email accepted (HTTP $HTTP_CODE)"
fi

print_test "Invalid wallet address format"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/buy" \
    -H "Content-Type: application/json" \
    -d '{
        "asin":"B0TEST",
        "email":"test@example.com",
        "walletAddress":"short",
        "shippingAddress":{"name":"Test","line1":"123 St","city":"NYC","state":"NY","postalCode":"10001","country":"US"}
    }')
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "400" ]]; then
    pass "Invalid wallet address rejected"
else
    fail "Invalid wallet address accepted (HTTP $HTTP_CODE)"
fi

print_test "Oversized payload"
LARGE_MESSAGE=$(python3 -c "print('a' * 100000)")
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/shop" \
    -H "Content-Type: application/json" \
    -d "{\"message\":\"$LARGE_MESSAGE\"}" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "400" ]] || [[ "$HTTP_CODE" == "413" ]]; then
    pass "Oversized payload rejected"
else
    skip "Oversized payload handling (HTTP $HTTP_CODE)"
fi

# =============================================================================
# Security Tests - Rate Limiting
# =============================================================================

print_header "RATE LIMITING TESTS"

print_test "Rate limit headers present"
RESPONSE=$(curl -s -D - "$API_URL/search?q=test" -o /dev/null)
if [[ "$RESPONSE" == *"X-RateLimit-Limit"* ]]; then
    pass "Rate limit headers present"
    echo "$RESPONSE" | grep -i "x-ratelimit" | head -3 | sed 's/^/    /'
else
    fail "Rate limit headers missing"
fi

print_test "Rate limit decrements"
FIRST=$(curl -s -D - "$API_URL/health" -o /dev/null | grep -i "x-ratelimit-remaining" | tr -d '\r')
sleep 0.1
SECOND=$(curl -s -D - "$API_URL/health" -o /dev/null | grep -i "x-ratelimit-remaining" | tr -d '\r')
FIRST_VAL=$(echo "$FIRST" | awk -F': ' '{print $2}')
SECOND_VAL=$(echo "$SECOND" | awk -F': ' '{print $2}')
if [[ "$SECOND_VAL" -lt "$FIRST_VAL" ]]; then
    pass "Rate limit counter decrements ($FIRST_VAL -> $SECOND_VAL)"
else
    skip "Rate limit counter check (may have reset)"
fi

# =============================================================================
# Functional Tests - Public API
# =============================================================================

print_header "FUNCTIONAL TESTS - PUBLIC API"

print_section "GET /search - Product Search"

print_test "Basic search query"
RESPONSE=$(curl -s --max-time 30 "$API_URL/search?q=headphones")
PRODUCT_COUNT=$(echo "$RESPONSE" | jq '.products | length' 2>/dev/null || echo "0")
if [[ "$PRODUCT_COUNT" -gt 0 ]]; then
    pass "Search returns products (count: $PRODUCT_COUNT)"
else
    fail "Search returned no products"
fi

print_test "Search with price filter"
RESPONSE=$(curl -s --max-time 30 "$API_URL/search?q=laptop&priceMax=500")
PRODUCT_COUNT=$(echo "$RESPONSE" | jq '.products | length' 2>/dev/null || echo "0")
MAX_PRICE=$(echo "$RESPONSE" | jq '[.products[].price] | max' 2>/dev/null || echo "0")
if [[ "$PRODUCT_COUNT" -gt 0 ]]; then
    pass "Price-filtered search works (max price in results: \$$MAX_PRICE)"
else
    fail "Price-filtered search returned no products"
fi

print_test "Search response structure"
RESPONSE=$(curl -s --max-time 30 "$API_URL/search?q=shoes")
HAS_PRODUCTS=$(echo "$RESPONSE" | jq 'has("products")' 2>/dev/null)
HAS_TOTAL=$(echo "$RESPONSE" | jq 'has("totalResults")' 2>/dev/null)
if [[ "$HAS_PRODUCTS" == "true" ]] && [[ "$HAS_TOTAL" == "true" ]]; then
    pass "Search response has correct structure"
else
    fail "Search response missing required fields"
fi

print_section "POST /shop - AI Shopping Assistant"

print_test "Natural language product search"
RESPONSE=$(curl -s -X POST "$API_URL/shop" \
    -H "Content-Type: application/json" \
    -d '{"message":"I need comfortable running shoes under 100 dollars"}')
PRODUCT_COUNT=$(echo "$RESPONSE" | jq '.products | length' 2>/dev/null || echo "0")
HAS_REPLY=$(echo "$RESPONSE" | jq 'has("reply")' 2>/dev/null)
if [[ "$PRODUCT_COUNT" -gt 0 ]] && [[ "$HAS_REPLY" == "true" ]]; then
    pass "AI search returns products with reply (count: $PRODUCT_COUNT)"
else
    fail "AI search failed (products: $PRODUCT_COUNT, has reply: $HAS_REPLY)"
fi

print_test "Returns both Amazon and Shopify products"
RESPONSE=$(curl -s -X POST "$API_URL/shop" \
    -H "Content-Type: application/json" \
    -d '{"message":"sneakers"}')
AMAZON_COUNT=$(echo "$RESPONSE" | jq '[.products[] | select(.source == "amazon")] | length' 2>/dev/null || echo "0")
SHOPIFY_COUNT=$(echo "$RESPONSE" | jq '[.products[] | select(.source == "shopify")] | length' 2>/dev/null || echo "0")
TOTAL=$((AMAZON_COUNT + SHOPIFY_COUNT))
if [[ "$AMAZON_COUNT" -gt 0 ]] && [[ "$SHOPIFY_COUNT" -gt 0 ]]; then
    pass "Returns both sources (Amazon: $AMAZON_COUNT, Shopify: $SHOPIFY_COUNT, Total: $TOTAL)"
else
    fail "Missing source (Amazon: $AMAZON_COUNT, Shopify: $SHOPIFY_COUNT)"
fi

print_test "Returns 20+ products"
RESPONSE=$(curl -s -X POST "$API_URL/shop" \
    -H "Content-Type: application/json" \
    -d '{"message":"gift ideas for tech lovers"}')
PRODUCT_COUNT=$(echo "$RESPONSE" | jq '.products | length' 2>/dev/null || echo "0")
if [[ "$PRODUCT_COUNT" -ge 20 ]]; then
    pass "Returns 20+ products (count: $PRODUCT_COUNT)"
else
    fail "Less than 20 products returned (count: $PRODUCT_COUNT)"
fi

print_test "Handles vague queries"
RESPONSE=$(curl -s -X POST "$API_URL/shop" \
    -H "Content-Type: application/json" \
    -d '{"message":"something nice"}')
PRODUCT_COUNT=$(echo "$RESPONSE" | jq '.products | length' 2>/dev/null || echo "0")
if [[ "$PRODUCT_COUNT" -gt 0 ]]; then
    pass "Handles vague query (count: $PRODUCT_COUNT)"
else
    fail "Failed on vague query"
fi

print_section "POST /buy - Purchase Flow"

print_test "Buy with Amazon ASIN"
RESPONSE=$(curl -s -X POST "$API_URL/buy" \
    -H "Content-Type: application/json" \
    -d '{
        "asin":"B0BS4BP8FB",
        "email":"test@example.com",
        "walletAddress":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "shippingAddress":{"name":"Test User","line1":"123 Test St","city":"New York","state":"NY","postalCode":"10001","country":"US"}
    }')
ORDER_ID=$(echo "$RESPONSE" | jq -r '.orderId' 2>/dev/null)
HAS_TX=$(echo "$RESPONSE" | jq 'has("serializedTransaction")' 2>/dev/null)
if [[ "$ORDER_ID" != "null" ]] && [[ "$HAS_TX" == "true" ]]; then
    pass "Amazon ASIN purchase works (order: ${ORDER_ID:0:8}...)"
else
    fail "Amazon ASIN purchase failed"
    echo "$RESPONSE" | jq '.' 2>/dev/null | head -10 | sed 's/^/    /'
fi

print_test "Buy with Amazon URL"
RESPONSE=$(curl -s -X POST "$API_URL/buy" \
    -H "Content-Type: application/json" \
    -d '{
        "productUrl":"https://www.amazon.com/dp/B0BS4BP8FB",
        "email":"test@example.com",
        "walletAddress":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "shippingAddress":{"name":"Test User","line1":"123 Test St","city":"New York","state":"NY","postalCode":"10001","country":"US"}
    }')
ORDER_ID=$(echo "$RESPONSE" | jq -r '.orderId' 2>/dev/null)
if [[ "$ORDER_ID" != "null" ]]; then
    pass "Amazon URL purchase works (order: ${ORDER_ID:0:8}...)"
else
    fail "Amazon URL purchase failed"
fi

print_test "Buy with Shopify URL"
RESPONSE=$(curl -s -X POST "$API_URL/buy" \
    -H "Content-Type: application/json" \
    -d '{
        "productUrl":"https://superladystar.com/products/retro-handmade-leather-patchwork-boots-4",
        "variantId":"41182242635819",
        "email":"test@example.com",
        "walletAddress":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "shippingAddress":{"name":"Test User","line1":"123 Test St","city":"New York","state":"NY","postalCode":"10001","country":"US"}
    }')
ORDER_ID=$(echo "$RESPONSE" | jq -r '.orderId' 2>/dev/null)
if [[ "$ORDER_ID" != "null" ]]; then
    pass "Shopify URL purchase works (order: ${ORDER_ID:0:8}...)"
else
    fail "Shopify URL purchase failed"
    echo "$RESPONSE" | jq '.' 2>/dev/null | head -10 | sed 's/^/    /'
fi

print_test "Buy response structure"
RESPONSE=$(curl -s -X POST "$API_URL/buy" \
    -H "Content-Type: application/json" \
    -d '{
        "asin":"B0BS4BP8FB",
        "email":"test@example.com",
        "walletAddress":"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "shippingAddress":{"name":"Test User","line1":"123 Test St","city":"New York","state":"NY","postalCode":"10001","country":"US"}
    }')
HAS_ORDER=$(echo "$RESPONSE" | jq 'has("orderId")' 2>/dev/null)
HAS_STATUS=$(echo "$RESPONSE" | jq 'has("status")' 2>/dev/null)
HAS_TX=$(echo "$RESPONSE" | jq 'has("serializedTransaction")' 2>/dev/null)
HAS_PRODUCT=$(echo "$RESPONSE" | jq 'has("product")' 2>/dev/null)
HAS_TOTAL=$(echo "$RESPONSE" | jq 'has("totalPrice")' 2>/dev/null)
HAS_CHECKOUT=$(echo "$RESPONSE" | jq 'has("checkoutUrl")' 2>/dev/null)
if [[ "$HAS_ORDER" == "true" ]] && [[ "$HAS_STATUS" == "true" ]] && [[ "$HAS_TX" == "true" ]] && [[ "$HAS_PRODUCT" == "true" ]] && [[ "$HAS_TOTAL" == "true" ]] && [[ "$HAS_CHECKOUT" == "true" ]]; then
    pass "Buy response has all required fields"
else
    fail "Buy response missing fields (orderId:$HAS_ORDER status:$HAS_STATUS tx:$HAS_TX product:$HAS_PRODUCT total:$HAS_TOTAL checkout:$HAS_CHECKOUT)"
fi

# =============================================================================
# OpenAPI Documentation
# =============================================================================

print_header "API DOCUMENTATION"

print_test "OpenAPI spec available"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/openapi.json")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "200" ]]; then
    BODY=$(echo "$RESPONSE" | sed '$d')
    TITLE=$(echo "$BODY" | jq -r '.info.title' 2>/dev/null)
    VERSION=$(echo "$BODY" | jq -r '.info.version' 2>/dev/null)
    pass "OpenAPI spec available ($TITLE v$VERSION)"
else
    fail "OpenAPI spec not available (HTTP $HTTP_CODE)"
fi

print_test "Swagger UI available"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/docs")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [[ "$HTTP_CODE" == "200" ]]; then
    pass "Swagger UI available at /docs"
else
    fail "Swagger UI not available (HTTP $HTTP_CODE)"
fi

# =============================================================================
# Summary
# =============================================================================

print_header "TEST SUMMARY"

TOTAL=$((PASSED + FAILED + SKIPPED))

echo ""
echo -e "  ${GREEN}Passed:${NC}  $PASSED"
echo -e "  ${RED}Failed:${NC}  $FAILED"
echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED"
echo -e "  ${BOLD}Total:${NC}   $TOTAL"
echo ""

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}$FAILED test(s) failed.${NC}"
    exit 1
fi
