#!/bin/bash
#
# Store and retrieve the Anthropic API key using macOS Keychain.
#
# Usage:
#   ./scripts/keychain-setup.sh store    — Store API key in Keychain
#   ./scripts/keychain-setup.sh read     — Print API key from Keychain
#   ./scripts/keychain-setup.sh wrapper  — Print a shell snippet for launchd
#
# This avoids storing ANTHROPIC_API_KEY in plaintext .env files.
# The daemon's plist uses a wrapper script that reads from Keychain
# before starting Lavern.

set -euo pipefail

ACCOUNT="lavern"
SERVICE="anthropic-api-key"

case "${1:-help}" in
  store)
    echo -n "Enter ANTHROPIC_API_KEY: "
    read -rs KEY
    echo
    security add-generic-password -a "$ACCOUNT" -s "$SERVICE" -w "$KEY" -U 2>/dev/null || \
      security add-generic-password -a "$ACCOUNT" -s "$SERVICE" -w "$KEY"
    echo "Stored in Keychain (account=$ACCOUNT, service=$SERVICE)"
    echo "The daemon will read this key automatically on next start."
    ;;
  read)
    security find-generic-password -a "$ACCOUNT" -s "$SERVICE" -w 2>/dev/null || {
      echo "No key found in Keychain. Run: $0 store" >&2
      exit 1
    }
    ;;
  wrapper)
    # Print a wrapper script that loads the key from Keychain before exec
    cat <<'WRAPPER'
#!/bin/bash
# Auto-generated Lavern startup wrapper.
# Reads ANTHROPIC_API_KEY from macOS Keychain, falls back to .env file.
export ANTHROPIC_API_KEY="$(security find-generic-password -a lavern -s anthropic-api-key -w 2>/dev/null)"
if [ -z "$ANTHROPIC_API_KEY" ]; then
  # Fallback: source .env file if Keychain has no entry
  ENV_FILE="$(dirname "$0")/../../.env"
  if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | grep ANTHROPIC_API_KEY | xargs)
  fi
fi
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "ERROR: No API key found in Keychain or .env" >&2
  echo "Run: ./scripts/keychain-setup.sh store" >&2
  exit 1
fi
exec "$@"
WRAPPER
    ;;
  *)
    echo "Lavern — macOS Keychain API Key Manager"
    echo ""
    echo "Usage: $0 {store|read|wrapper}"
    echo ""
    echo "  store    Store ANTHROPIC_API_KEY in macOS Keychain"
    echo "  read     Print the stored key (for verification)"
    echo "  wrapper  Print a shell wrapper script for launchd"
    exit 1
    ;;
esac
