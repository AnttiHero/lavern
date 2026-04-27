#!/usr/bin/env bash
# Build a Lavern release tarball for the local-install flow.
#
# Output: dist/lavern-vX.Y.Z.tar.gz containing the source needed to run
# locally — excluding .git, node_modules, secrets, and dev-only artifacts.
#
# The install.sh script downloads this tarball, extracts it to ~/Lavern,
# runs `npm install` inside it, and starts the server.
#
# Usage: scripts/build-release-tarball.sh [version]

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:-$(node -e "console.log(require('./package.json').version)")}"
OUT_DIR="dist"
OUT_FILE="$OUT_DIR/lavern-v$VERSION.tar.gz"

mkdir -p "$OUT_DIR"

echo "Building lavern-v$VERSION.tar.gz…"

# Use git ls-files to enumerate tracked files (deterministic, ignores .gitignore).
# Then strip the secrets/dev-only paths that should never reach a customer host.
STAGE_DIR=$(mktemp -d)/lavern-v$VERSION
mkdir -p "$STAGE_DIR"

# Stage only the files we want into a temp dir, then tar that.
# This works around macOS bsdtar lacking --transform.
git ls-files | \
  grep -vE '^(audit-logs/|data/|\.shem/|dist/|coverage/|tests/|menubar/|docs/|site/dist/|Mac/|Test images/|Screenshots/|Site images/)' | \
  grep -vE '^\.env$|^\.env\.local$' | \
  grep -vE '\.(test|spec)\.(ts|tsx|js|jsx)$' | \
  grep -vE '^(salvage-|whiteshoe-|marble-).*\.(ts|html|pdf|md)$' | \
  grep -vE '\.(pdf|mov|mp4|psd|sketch|fig)$' | \
  grep -vE '^viz/src/__tests__/' | \
  grep -vE '^src/__tests__/' | \
  grep -vE '^scripts/(seed-|load-test\.|smoke-test\.)' | \
  while IFS= read -r file; do
    target="$STAGE_DIR/$file"
    mkdir -p "$(dirname "$target")"
    cp "$file" "$target"
  done

# Add the built dashboard if present (viz/dist) — local installs serve this
# as static files, no Vite dev server needed.
if [ -d "viz/dist" ]; then
  mkdir -p "$STAGE_DIR/viz/dist"
  cp -R viz/dist/. "$STAGE_DIR/viz/dist/"
fi

# Tar from the parent of the staging dir so the archive contains lavern-vX.Y.Z/...
tar -czf "$OUT_FILE" -C "$(dirname "$STAGE_DIR")" "$(basename "$STAGE_DIR")"
rm -rf "$(dirname "$STAGE_DIR")"

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo "  → $OUT_FILE ($SIZE)"
echo
echo "To deploy:"
echo "  1. Upload to https://lavern.ai/dist/lavern-v$VERSION.tar.gz"
echo "  2. Update install.sh to reference v$VERSION"
echo "  3. Tag the release: git tag v$VERSION && git push --tags"
