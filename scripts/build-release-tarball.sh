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
git ls-files | \
  grep -vE '^(audit-logs|data|.shem|dist|coverage|tests/fixtures|\.env$|\.env\.local$)' | \
  grep -vE '\.test\.ts$|\.spec\.ts$' \
  > "$OUT_DIR/_files.txt"

# Add the built dashboard if present (viz/dist) — local installs serve this
# as static files, no Vite dev server needed.
if [ -d "viz/dist" ]; then
  find viz/dist -type f >> "$OUT_DIR/_files.txt"
fi

# Tar with a top-level dir of "lavern-v$VERSION" so extraction creates one
# folder, not 1000 files in cwd.
tar -czf "$OUT_FILE" \
  --transform "s,^,lavern-v$VERSION/," \
  -T "$OUT_DIR/_files.txt"

rm "$OUT_DIR/_files.txt"

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo "  → $OUT_FILE ($SIZE)"
echo
echo "To deploy:"
echo "  1. Upload to https://lavern.ai/dist/lavern-v$VERSION.tar.gz"
echo "  2. Update install.sh to reference v$VERSION"
echo "  3. Tag the release: git tag v$VERSION && git push --tags"
