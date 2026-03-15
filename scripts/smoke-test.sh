#!/usr/bin/env bash
# Whiteshoe API Smoke Test — verifies the core session lifecycle.
# Usage: ./scripts/smoke-test.sh [base_url]

BASE="${1:-http://localhost:3000}"
PASS=0
FAIL=0

pass() { printf "  ✓ %s\n" "$1"; PASS=$((PASS + 1)); }
fail() { printf "  ✗ %s\n" "$1"; FAIL=$((FAIL + 1)); }

# Extract a JSON string value (no jq required)
json_val() { printf '%s' "$1" | grep -o "\"$2\":\"[^\"]*\"" | head -1 | sed "s/\"$2\":\"//;s/\"$//" ; }

printf "Whiteshoe Smoke Test\nTarget: %s\n\n" "$BASE"

# 1. Health
printf "1. Health check\n"
if curl -sf "$BASE/health" > /dev/null 2>&1; then
  pass "API is running"
else
  fail "API is not reachable at $BASE"
  printf "\nResult: %d passed, %d failed\n" "$PASS" "$FAIL"
  exit 1
fi

# 2. Create session
printf "2. Create session\n"
RESP=$(curl -sf -X POST "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"request":{"type":"legal_question","requestText":"What is force majeure?"},"team":["Contract Analyst"],"workflow":"counsel","options":{"budget":5,"intensity":"standard"}}' 2>&1 || true)

SID=$(json_val "$RESP" "sessionId")
if [ -n "$SID" ]; then
  pass "Session created: $SID"
else
  fail "Session creation failed"
fi

# 3. Verify session exists
printf "3. Verify session\n"
if [ -n "$SID" ]; then
  sleep 2
  GRESP=$(curl -sf "$BASE/api/sessions/$SID" 2>&1 || true)
  STEP=$(json_val "$GRESP" "currentStep")
  if [ -n "$STEP" ]; then
    pass "Session active (step: $STEP)"
  else
    fail "Session not found"
  fi
else
  fail "Skipped — no session ID"
fi

# 4. Delete session
printf "4. Clean up\n"
if [ -n "$SID" ]; then
  DSTAT=$(curl -sf -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/sessions/$SID" \
    -H "Content-Type: application/json" \
    -d '{"reason":"smoke test cleanup"}' 2>&1 || true)
  if [ "$DSTAT" = "200" ] || [ "$DSTAT" = "204" ]; then
    pass "Session deleted"
  else
    fail "Delete returned $DSTAT"
  fi
else
  fail "Skipped — no session ID"
fi

# Summary
printf "\nResult: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
