#!/usr/bin/env bash
# Lavern API Smoke Test — verifies the core session lifecycle.
# Usage: ./scripts/smoke-test.sh [base_url]
# Requires: sqlite3 (for auto-verifying test user email)

BASE="${1:-http://localhost:3000}"
DB="${SHEM_DB_PATH:-./data/lavern.db}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
trap "rm -f $COOKIE_JAR" EXIT

pass() { printf "  ✓ %s\n" "$1"; PASS=$((PASS + 1)); }
fail() { printf "  ✗ %s\n" "$1"; FAIL=$((FAIL + 1)); }

# Extract a JSON string value (no jq required)
json_val() { printf '%s' "$1" | grep -o "\"$2\":\"[^\"]*\"" | head -1 | sed "s/\"$2\":\"//;s/\"$//" ; }

printf "Lavern Smoke Test\nTarget: %s\n\n" "$BASE"

# 1. Health
printf "1. Health check\n"
if curl -sf "$BASE/health" > /dev/null 2>&1; then
  pass "API is running"
else
  fail "API is not reachable at $BASE"
  printf "\nResult: %d passed, %d failed\n" "$PASS" "$FAIL"
  exit 1
fi

# 2. Sign up test user
SMOKE_EMAIL="smoke-test-$(date +%s)@example.com"
SMOKE_PASS="SmokeTest1234!"
printf "2. Sign up test user\n"
SIGNUP_RESP=$(curl -sf -X POST "$BASE/api/auth/signup" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASS\",\"displayName\":\"Smoke Test\"}" 2>&1 || true)

SMOKE_UID=$(json_val "$SIGNUP_RESP" "id")
if [ -n "$SMOKE_UID" ]; then
  pass "User created: $SMOKE_EMAIL"
else
  fail "Auth failed: $SIGNUP_RESP"
fi

# 3. Auto-verify email (via SQLite — smoke test only)
printf "3. Verify email\n"
if command -v sqlite3 > /dev/null 2>&1 && [ -f "$DB" ] && [ -n "$SMOKE_UID" ]; then
  sqlite3 "$DB" "UPDATE users SET email_verified = 1 WHERE id = '$SMOKE_UID';"
  pass "Email auto-verified (SQLite)"
else
  # Fallback: try to get verify token from DB
  if [ -f "$DB" ] && [ -n "$SMOKE_UID" ]; then
    VTOKEN=$(sqlite3 "$DB" "SELECT token FROM user_tokens WHERE user_id = '$SMOKE_UID' AND type = 'verify' LIMIT 1;" 2>/dev/null || true)
    if [ -n "$VTOKEN" ]; then
      curl -sf -X POST "$BASE/api/auth/verify-email" \
        -H "Content-Type: application/json" \
        -d "{\"token\":\"$VTOKEN\"}" > /dev/null 2>&1
      pass "Email verified via token"
    else
      fail "Cannot verify email — sqlite3 not available or no token found"
    fi
  else
    fail "Cannot verify email — DB not found at $DB"
  fi
fi

# 4. Create session (authenticated)
printf "4. Create session\n"
RESP=$(curl -sf -X POST "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{"request":{"type":"legal_question","requestText":"What is force majeure?"},"team":["Contract Analyst"],"workflow":"counsel","options":{"budget":5,"intensity":"standard"}}' 2>&1 || true)

SID=$(json_val "$RESP" "sessionId")
if [ -n "$SID" ]; then
  pass "Session created: $SID"
else
  fail "Session creation failed: $RESP"
fi

# 5. Verify session exists (active or archived)
printf "5. Verify session\n"
if [ -n "$SID" ]; then
  sleep 2
  GRESP=$(curl -sf "$BASE/api/sessions/$SID" 2>&1 || true)
  STEP=$(json_val "$GRESP" "currentStep")
  if [ -n "$STEP" ]; then
    pass "Session active (step: $STEP)"
  else
    # Check archive — fast sessions may have already completed
    ARESP=$(curl -sf "$BASE/api/sessions/archive/$SID" 2>&1 || true)
    ASTATUS=$(json_val "$ARESP" "status")
    if [ -n "$ASTATUS" ]; then
      pass "Session completed (archived: $ASTATUS)"
    else
      fail "Session not found (active or archive)"
    fi
  fi
else
  fail "Skipped — no session ID"
fi

# 6. Verify auth required (unauthenticated session creation should fail)
printf "6. Auth enforcement\n"
UNAUTH_RESP=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$BASE/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"request":{"type":"legal_question","requestText":"test"},"team":["Contract Analyst"],"workflow":"counsel"}' 2>&1 || true)
if [ "$UNAUTH_RESP" = "401" ]; then
  pass "Unauthenticated session creation blocked (401)"
else
  fail "Expected 401, got $UNAUTH_RESP"
fi

# 7. Delete session
printf "7. Clean up\n"
if [ -n "$SID" ]; then
  DSTAT=$(curl -sf -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/sessions/$SID" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_JAR" \
    -d '{"reason":"smoke test cleanup"}' 2>&1 || true)
  if [ "$DSTAT" = "200" ] || [ "$DSTAT" = "204" ] || [ "$DSTAT" = "404" ]; then
    pass "Session cleaned up ($DSTAT)"
  else
    fail "Delete returned $DSTAT"
  fi
else
  fail "Skipped — no session ID"
fi

# Summary
printf "\nResult: %d passed, %d failed\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
