#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────
# Claw Demo — End-to-end validation of the Clawern document processing pipeline.
#
# Usage:
#   scripts/claw-demo.sh                     # Full demo (costs ~$0.50-1.50)
#   scripts/claw-demo.sh --dry-run           # Plan work without dispatching
#   scripts/claw-demo.sh --provider mistral  # EU sovereign provider
#
# What it does:
#   1. Creates a temp ~/.lavern-demo/ with a programmatic profile
#   2. Seeds 2 small documents (NDA + Terms of Service)
#   3. Runs `lavern claw start --once` to process them
#   4. Verifies delivery bundles were created
#   5. Prints cost summary
#   6. Cleans up
# ──────────────────────────────────────────────────────────────────────────

set -uo pipefail

DEMO_DIR="$HOME/.lavern-demo"
PROVIDER="claude"
DRY_RUN=""
EXTRA_FLAGS=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider) PROVIDER="$2"; shift 2 ;;
    --dry-run)  DRY_RUN="--dry-run"; shift ;;
    --debug)    EXTRA_FLAGS="$EXTRA_FLAGS --debug"; shift ;;
    *)          echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           CLAWERN END-TO-END DEMO                   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Provider:  $PROVIDER"
echo "  Dry run:   ${DRY_RUN:-no}"
echo "  Demo dir:  $DEMO_DIR"
echo ""

# ── Cleanup from prior run ──────────────────────────────────────────────
if [[ -d "$DEMO_DIR" ]]; then
  echo "⟳ Cleaning up prior demo directory..."
  rm -rf "$DEMO_DIR"
fi

# ── Create demo directory structure ─────────────────────────────────────
mkdir -p "$DEMO_DIR/watch"
mkdir -p "$DEMO_DIR/delivery"

# ── Create programmatic profile ─────────────────────────────────────────
ETHICAL="false"
if [[ "$PROVIDER" == "mistral" ]]; then
  ETHICAL="true"
fi

cat > "$DEMO_DIR/profile.json" << PROFILE
{
  "company": "Demo Corp",
  "jurisdiction": "United States — Delaware",
  "industry": "Technology",
  "size": "startup",
  "concerns": ["data privacy", "IP protection"],
  "watchPaths": ["$DEMO_DIR/watch"],
  "budget": {
    "totalUsd": 5.0,
    "perDocumentMaxUsd": 2.0
  },
  "preferences": {
    "style": "plain-language",
    "intensity": "quick",
    "riskAppetite": "moderate"
  },
  "ethicalMode": $ETHICAL,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
PROFILE

echo "✓ Profile created"

# ── Seed test documents ────────────────────────────────────────────────

cat > "$DEMO_DIR/watch/mutual-nda.md" << 'NDA'
# MUTUAL NON-DISCLOSURE AGREEMENT

**Effective Date:** January 1, 2025

**Between:** Demo Corp ("Party A") and Acme Inc. ("Party B")

## 1. Purpose
The parties wish to explore a potential business relationship and may need to share confidential information.

## 2. Confidential Information
"Confidential Information" means any non-public information disclosed by either party, including but not limited to: trade secrets, business plans, financial data, customer lists, and technical specifications.

## 3. Obligations
Each receiving party shall:
- Hold Confidential Information in strict confidence
- Not disclose to any third party without prior written consent
- Use only for the purpose stated herein
- Protect with at least the same degree of care used for its own confidential information

## 4. Exclusions
Information is not confidential if it: (a) was publicly available, (b) was known to the receiving party, (c) was independently developed, or (d) was disclosed by a third party without restriction.

## 5. Term
This Agreement shall remain in effect for two (2) years from the Effective Date. Obligations of confidentiality shall survive for three (3) years after expiration.

## 6. Governing Law
This Agreement shall be governed by the laws of the State of Delaware.

---
Party A: ________________  Date: ________
Party B: ________________  Date: ________
NDA

cat > "$DEMO_DIR/watch/terms-of-service.md" << 'TOS'
# Terms of Service — Demo Corp

**Last Updated:** January 15, 2025

## 1. Acceptance
By accessing or using the Demo Corp platform ("Service"), you agree to these Terms.

## 2. Eligibility
You must be at least 18 years old and capable of entering into a binding agreement.

## 3. User Accounts
You are responsible for maintaining the confidentiality of your account credentials. You must notify us immediately of any unauthorized use.

## 4. Acceptable Use
You may not: (a) violate any law, (b) infringe intellectual property rights, (c) transmit malware, (d) attempt to access other users' accounts, or (e) use the Service for competitive analysis.

## 5. Fees and Payment
Subscription fees are billed monthly in advance. All fees are non-refundable except as required by law. We may change prices with 30 days' notice.

## 6. Intellectual Property
Demo Corp retains all rights to the Service. You retain ownership of your content but grant us a license to host and display it.

## 7. Limitation of Liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, DEMO CORP'S TOTAL LIABILITY SHALL NOT EXCEED THE FEES PAID BY YOU IN THE 12 MONTHS PRECEDING THE CLAIM.

## 8. Termination
We may terminate your access for violation of these Terms. Upon termination, your right to use the Service ceases immediately.

## 9. Governing Law
These Terms are governed by the laws of the State of Delaware. Any disputes shall be resolved in the courts of Wilmington, Delaware.

## 10. Changes
We may modify these Terms at any time. Continued use after changes constitutes acceptance.
TOS

echo "✓ 2 test documents seeded"
echo ""

# ── Run Clawern ─────────────────────────────────────────────────────────
echo "Starting Clawern processing..."
echo "─────────────────────────────────────────────────────"

npx tsx src/index.ts claw start \
  --dir "$DEMO_DIR" \
  --once \
  --intensity quick \
  $DRY_RUN \
  $EXTRA_FLAGS

echo ""
echo "─────────────────────────────────────────────────────"

# ── Verify results ──────────────────────────────────────────────────────
echo ""
echo "Verifying results..."

DELIVERY_COUNT=$(find "$DEMO_DIR/delivery" -name "manifest.json" 2>/dev/null | wc -l | tr -d ' ')
ERROR_COUNT=$(find "$DEMO_DIR/delivery/failed" -type f 2>/dev/null | wc -l | tr -d ' ')

if [[ -n "$DRY_RUN" ]]; then
  echo "✓ Dry run complete — no documents were processed"
  # Cleanup
  rm -rf "$DEMO_DIR"
  echo "✓ Cleaned up $DEMO_DIR"
  echo ""
  echo "Done."
  exit 0
else
  echo "  Deliveries: $DELIVERY_COUNT"
  echo "  Errors:     $ERROR_COUNT"

  if [[ "$DELIVERY_COUNT" -ge 1 ]]; then
    echo "✓ Demo passed — delivery bundles created"

    # Show manifest summaries
    echo ""
    for manifest in "$DEMO_DIR/delivery"/*/manifest.json; do
      if [[ -f "$manifest" ]]; then
        SESSION=$(basename "$(dirname "$manifest")")
        STATUS=$(python3 -c "import json; print(json.load(open('$manifest'))['status'])" 2>/dev/null || echo "unknown")
        COST=$(python3 -c "import json; print(json.load(open('$manifest')).get('execution',{}).get('totalCostUsd','?'))" 2>/dev/null || echo "?")
        FILENAME=$(python3 -c "import json; print(json.load(open('$manifest')).get('input',{}).get('filename','?'))" 2>/dev/null || echo "?")
        echo "  📄 $FILENAME → $STATUS (\$$COST)"
      fi
    done
  else
    echo "✗ Demo failed — no delivery bundles found"
  fi
fi

# ── Cleanup ─────────────────────────────────────────────────────────────
echo ""
read -p "Clean up demo directory? [Y/n] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  rm -rf "$DEMO_DIR"
  echo "✓ Cleaned up $DEMO_DIR"
else
  echo "  Kept $DEMO_DIR for inspection"
fi

echo ""
echo "Done."
