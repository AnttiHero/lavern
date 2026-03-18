#!/usr/bin/env bash
# ── Stripe Environment Setup & Smoke Test ──────────────────────────────
#
# Verifies Stripe environment variables are configured, tests API
# connectivity, and prints webhook forwarding instructions.
#
# Usage:
#   ./scripts/stripe-setup.sh          # Check env + connectivity
#   ./scripts/stripe-setup.sh --smoke  # Full smoke test (requires running server)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

info()  { echo -e "${CYAN}ℹ${NC}  $1"; }
ok()    { echo -e "${GREEN}✓${NC}  $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
fail()  { echo -e "${RED}✗${NC}  $1"; }

echo ""
echo -e "${BOLD}Lavern — Stripe Setup${NC}"
echo "────────────────────────────────────"
echo ""

# ── 1. Check .env file ────────────────────────────────────────────────

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="../.env"
fi

ERRORS=0

# Source env file if it exists
if [ -f "$ENV_FILE" ]; then
  info "Reading from $ENV_FILE"
  set -a
  source "$ENV_FILE" 2>/dev/null || true
  set +a
else
  warn "No .env file found. Checking environment variables directly."
fi

echo ""
echo -e "${BOLD}1. Environment Variables${NC}"
echo ""

# Check STRIPE_SECRET_KEY
if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  fail "STRIPE_SECRET_KEY not set"
  ERRORS=$((ERRORS + 1))
elif [[ "$STRIPE_SECRET_KEY" == sk_test_* ]]; then
  ok "STRIPE_SECRET_KEY set (test mode)"
elif [[ "$STRIPE_SECRET_KEY" == sk_live_* ]]; then
  warn "STRIPE_SECRET_KEY set (LIVE mode — be careful!)"
else
  fail "STRIPE_SECRET_KEY has unexpected format"
  ERRORS=$((ERRORS + 1))
fi

# Check STRIPE_WEBHOOK_SECRET
if [ -z "${STRIPE_WEBHOOK_SECRET:-}" ]; then
  fail "STRIPE_WEBHOOK_SECRET not set"
  ERRORS=$((ERRORS + 1))
elif [[ "$STRIPE_WEBHOOK_SECRET" == whsec_* ]]; then
  ok "STRIPE_WEBHOOK_SECRET set"
else
  fail "STRIPE_WEBHOOK_SECRET has unexpected format (should start with whsec_)"
  ERRORS=$((ERRORS + 1))
fi

# Check optional URLs
if [ -n "${STRIPE_SUCCESS_URL:-}" ]; then
  ok "STRIPE_SUCCESS_URL = ${STRIPE_SUCCESS_URL}"
else
  info "STRIPE_SUCCESS_URL not set (will use default)"
fi

if [ -n "${STRIPE_CANCEL_URL:-}" ]; then
  ok "STRIPE_CANCEL_URL = ${STRIPE_CANCEL_URL}"
else
  info "STRIPE_CANCEL_URL not set (will use default)"
fi

# ── 2. Test Stripe API connectivity ──────────────────────────────────

echo ""
echo -e "${BOLD}2. API Connectivity${NC}"
echo ""

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  fail "Cannot test API — STRIPE_SECRET_KEY not set"
else
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${STRIPE_SECRET_KEY}" \
    "https://api.stripe.com/v1/balance" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    ok "Stripe API reachable (HTTP $HTTP_CODE)"
  elif [ "$HTTP_CODE" = "401" ]; then
    fail "Stripe API returned 401 — invalid API key"
    ERRORS=$((ERRORS + 1))
  elif [ "$HTTP_CODE" = "000" ]; then
    fail "Cannot reach Stripe API — check your network"
    ERRORS=$((ERRORS + 1))
  else
    warn "Stripe API returned HTTP $HTTP_CODE"
  fi
fi

# ── 3. Print setup instructions if errors ─────────────────────────────

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo -e "${BOLD}Setup Instructions${NC}"
  echo ""
  echo "  1. Create a Stripe account at https://dashboard.stripe.com"
  echo "  2. Go to Developers → API Keys"
  echo "  3. Copy the Secret Key (starts with sk_test_)"
  echo "  4. Add to your .env file:"
  echo ""
  echo "     STRIPE_SECRET_KEY=sk_test_..."
  echo "     STRIPE_WEBHOOK_SECRET=whsec_..."
  echo ""
  echo "  5. For local webhook testing, install Stripe CLI:"
  echo "     brew install stripe/stripe-cli/stripe"
  echo ""
  echo "  6. Forward webhooks to your local server:"
  echo "     stripe listen --forward-to localhost:3000/api/billing/webhook"
  echo ""
  echo "  7. Copy the webhook signing secret (whsec_...) to .env"
  echo ""
fi

# ── 4. Print webhook forwarding command ───────────────────────────────

echo ""
echo -e "${BOLD}3. Webhook Forwarding${NC}"
echo ""
info "To receive Stripe webhooks locally, run:"
echo ""
echo "  stripe listen --forward-to localhost:${SHEM_PORT:-3000}/api/billing/webhook"
echo ""
info "Then copy the webhook signing secret to your .env as STRIPE_WEBHOOK_SECRET"

# ── 5. Smoke test (--smoke flag) ──────────────────────────────────────

if [[ "${1:-}" == "--smoke" ]]; then
  echo ""
  echo -e "${BOLD}4. Smoke Test${NC}"
  echo ""

  BASE_URL="${SHEM_BASE_URL:-http://localhost:${SHEM_PORT:-3000}}"

  # Check server is running
  info "Testing server at $BASE_URL ..."
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" != "200" ]; then
    fail "Server not reachable at $BASE_URL (HTTP $HTTP_CODE)"
    echo "  Start the server first: npm run dev"
    exit 1
  fi
  ok "Server is running"

  # Test billing status endpoint (unauthenticated — should return 401)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/billing/status" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "401" ]; then
    ok "GET /api/billing/status returns 401 (unauthenticated) — correct"
  elif [ "$HTTP_CODE" = "200" ]; then
    ok "GET /api/billing/status returns 200"
  else
    warn "GET /api/billing/status returned HTTP $HTTP_CODE"
  fi

  # Test stripe-config endpoint
  RESPONSE=$(curl -s "$BASE_URL/api/billing/stripe-config" 2>/dev/null || echo "{}")
  if echo "$RESPONSE" | grep -q "publishableKey"; then
    ok "GET /api/billing/stripe-config returns publishable key"
  elif echo "$RESPONSE" | grep -q "not configured"; then
    warn "Stripe not configured on server — set STRIPE_SECRET_KEY in .env"
  else
    warn "GET /api/billing/stripe-config unexpected response"
  fi

  echo ""
  ok "Smoke test complete"
fi

# ── Summary ───────────────────────────────────────────────────────────

echo ""
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All checks passed!${NC} Stripe is configured."
else
  echo -e "${YELLOW}${BOLD}$ERRORS issue(s) found.${NC} See instructions above."
fi
echo ""
