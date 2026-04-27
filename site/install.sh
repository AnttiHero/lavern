#!/usr/bin/env bash
# Lavern — local install script.
#
# Usage:
#   curl -fsSL https://lavern.ai/install.sh | bash
#
# What this does (in order):
#   1. Verifies macOS + Apple Silicon (best supported platform).
#   2. Installs Ollama if not already present.
#   3. Pulls the local model (gemma4:e4b, ~9.6 GB).
#   4. Installs Node.js if not already present (via nvm).
#   5. Downloads the Lavern source tarball to ~/Lavern.
#   6. Runs `npm install` (root + viz) and builds the dashboard.
#   7. Writes ~/Lavern/.env with LAVERN_PROVIDER=local pre-configured.
#   8. Starts the API server and opens the dashboard in your browser.
#
# All operations are idempotent — running again upgrades in place.
# No sudo required. No data leaves your machine.

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────
LAVERN_VERSION="${LAVERN_VERSION:-0.14.5}"
LAVERN_HOME="${LAVERN_HOME:-$HOME/Lavern}"
LAVERN_PORT="${LAVERN_PORT:-3000}"
LAVERN_TARBALL_URL="${LAVERN_TARBALL_URL:-https://lavern.ai/dist/lavern-v$LAVERN_VERSION.tar.gz}"

# RAM-aware model selection.
# macOS reports total RAM in bytes via sysctl. The thresholds:
#   < 12 GB → gemma2:2b   (small laptop — 1.6 GB pull, fits an 8 GB Air)
#   < 24 GB → gemma4:e4b  (16 GB Macbook — 9.6 GB pull, balanced)
#   ≥ 24 GB → gemma4:26b  (Pro/Max — 17 GB pull, highest quality)
# User can override by setting LAVERN_MODEL before running.
if [ -z "${LAVERN_MODEL:-}" ]; then
  TOTAL_RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
  TOTAL_RAM_GB=$(( TOTAL_RAM_BYTES / 1073741824 ))
  if   [ "$TOTAL_RAM_GB" -ge 24 ]; then LAVERN_MODEL="gemma4:26b"
  elif [ "$TOTAL_RAM_GB" -ge 12 ]; then LAVERN_MODEL="gemma4:e4b"
  else                                  LAVERN_MODEL="gemma2:2b"
  fi
fi

# ── Pretty output ────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
say() { echo -e "${BOLD}▸${NC} $1"; }
ok()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn(){ echo -e "  ${YELLOW}!${NC} $1"; }
die() { echo -e "  ${RED}✗${NC} $1"; exit 1; }

clear
cat <<'EOF'

  ╭──────────────────────────────────────────╮
  │                                          │
  │              L A V E R N                 │
  │     The driverless law firm — local.     │
  │                                          │
  ╰──────────────────────────────────────────╯

EOF

# ── Step 1: Platform check ───────────────────────────────────────────────
say "Checking platform…"

if [ "$(uname)" != "Darwin" ]; then
  die "This installer currently supports macOS only. Linux/Windows coming soon."
fi
ok "macOS detected"

ARCH="$(uname -m)"
if [ "$ARCH" != "arm64" ]; then
  warn "Intel Mac detected — local inference will work but be slower than Apple Silicon."
else
  ok "Apple Silicon ($ARCH)"
fi

FREE_GB=$(df -g "$HOME" | awk 'NR==2 {print $4}')
if [ "$FREE_GB" -lt 5 ]; then
  warn "Only ${FREE_GB} GB free on your home volume. The model alone needs more than that. Free up space and retry."
else
  ok "${FREE_GB} GB free disk"
fi

ok "RAM: ${TOTAL_RAM_GB:-?} GB → selected model: $LAVERN_MODEL"
echo

# ── Step 2: Ollama ───────────────────────────────────────────────────────
say "Setting up Ollama (local model runtime)…"

if [ -d "/Applications/Ollama.app" ] || command -v ollama >/dev/null 2>&1; then
  ok "Ollama already installed"
else
  warn "Ollama not found — downloading installer…"
  TMP_DMG=$(mktemp -d)/Ollama.dmg
  curl -fsSL "https://ollama.com/download/Ollama.dmg" -o "$TMP_DMG"
  hdiutil attach -quiet "$TMP_DMG"
  cp -R "/Volumes/Ollama/Ollama.app" /Applications/
  hdiutil detach -quiet "/Volumes/Ollama"
  rm "$TMP_DMG"
  ok "Ollama installed to /Applications"
fi

# Make the daemon-side ollama binary discoverable on PATH for this script
export PATH="/Applications/Ollama.app/Contents/Resources:$PATH"

# Boot the daemon if not already running.
# On a fresh Mac, the first launch of Ollama triggers a Gatekeeper warning
# AND a permission prompt that the user has to click through. `open -a` only
# fires the launch — it can't bypass those. So we open the app and then ask
# the user to confirm it's running.
if ! curl -sf -m 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
  say "Starting Ollama daemon…"
  open -a Ollama 2>/dev/null || true

  # Try for ~10 sec without prompting (covers the auto-launch case)
  for _ in $(seq 1 10); do
    sleep 1
    if curl -sf -m 2 http://localhost:11434/api/tags >/dev/null 2>&1; then break; fi
  done

  # Still not up? Walk the user through the first-launch click-through.
  if ! curl -sf -m 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
    cat <<'NOTE'

    Ollama hasn't responded yet. On a fresh Mac, you need to:
      1. Open Finder → Applications → double-click Ollama
      2. macOS will warn "Ollama was downloaded from the internet" — click Open
      3. Allow any permission prompts
      4. Look for the llama icon in the menu bar (top-right of screen)

    When you can see the llama icon, press ENTER to continue.
    (Or Ctrl-C to abort.)

NOTE
    read -r _

    # One more try, with a longer window for first-launch
    for _ in $(seq 1 30); do
      sleep 1
      if curl -sf -m 2 http://localhost:11434/api/tags >/dev/null 2>&1; then break; fi
    done
  fi
fi

if curl -sf -m 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
  ok "Ollama daemon reachable at http://localhost:11434"
else
  die "Ollama daemon still unreachable. The menu-bar app may not be running. Try opening it manually from /Applications and re-running this script."
fi
echo

# ── Step 3: Pull the model ───────────────────────────────────────────────
case "$LAVERN_MODEL" in
  gemma2:2b)   MODEL_SIZE_HINT="≈1.6 GB"; PULL_ETA="2–4 min" ;;
  gemma4:e4b)  MODEL_SIZE_HINT="≈9.6 GB"; PULL_ETA="10–20 min" ;;
  gemma4:26b)  MODEL_SIZE_HINT="≈17 GB";  PULL_ETA="20–40 min" ;;
  *)           MODEL_SIZE_HINT="size unknown"; PULL_ETA="time unknown" ;;
esac
say "Pulling local model: $LAVERN_MODEL ($MODEL_SIZE_HINT)…"

if curl -sf http://localhost:11434/api/tags | grep -q "\"$LAVERN_MODEL\""; then
  ok "Model $LAVERN_MODEL already pulled"
else
  warn "First-time pull — this will take ~$PULL_ETA on home Wi-Fi."
  ollama pull "$LAVERN_MODEL"
  ok "Model $LAVERN_MODEL ready"
fi
echo

# ── Step 3.5: Xcode Command Line Tools ───────────────────────────────────
# Native npm modules (better-sqlite3, etc.) compile at install time and need
# clang. macOS doesn't ship CLT preinstalled — without this check the install
# fails opaquely 4 minutes later in `npm install`.
say "Checking Xcode Command Line Tools…"

if xcode-select -p >/dev/null 2>&1; then
  ok "Xcode CLT installed at $(xcode-select -p)"
else
  warn "Xcode CLT not installed — required to compile native npm modules."
  warn "Triggering the install dialog now. macOS will ask you to accept."
  xcode-select --install 2>/dev/null || true

  cat <<'NOTE'

    A dialog should have appeared:
      1. Click "Install"
      2. Accept the license
      3. Wait for download (~2-3 GB, 5-15 min)

    When it says "The software was installed.", press ENTER to continue.
    (Or Ctrl-C to abort and re-run later.)

NOTE
  read -r _

  # Verify it took
  if ! xcode-select -p >/dev/null 2>&1; then
    die "Xcode CLT still not detected. Open Terminal, run 'xcode-select --install', complete the install, then re-run this script."
  fi
  ok "Xcode CLT installed"
fi
echo

# ── Step 4: Node.js ──────────────────────────────────────────────────────
say "Checking Node.js…"

NODE_OK=false
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge 20 ]; then
    NODE_OK=true
    ok "Node $(node -v)"
  fi
fi

if [ "$NODE_OK" = false ]; then
  warn "Node 20+ not found — installing via nvm…"
  if [ ! -d "$HOME/.nvm" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm use 22
  ok "Node $(node -v) (via nvm)"
fi
echo

# ── Step 5: Download Lavern source ───────────────────────────────────────
say "Downloading Lavern v$LAVERN_VERSION…"

mkdir -p "$LAVERN_HOME"
TMP_TAR=$(mktemp -d)/lavern.tar.gz

if curl -fsSL "$LAVERN_TARBALL_URL" -o "$TMP_TAR"; then
  ok "Tarball downloaded ($(du -h "$TMP_TAR" | cut -f1))"
  tar -xzf "$TMP_TAR" -C "$LAVERN_HOME" --strip-components=1
  rm "$TMP_TAR"
  ok "Extracted to $LAVERN_HOME"
else
  die "Download failed: $LAVERN_TARBALL_URL"
fi
echo

# ── Step 6: npm install + build ──────────────────────────────────────────
cd "$LAVERN_HOME"

say "Installing dependencies (this takes 1–2 min)…"
npm install --silent --no-audit --no-fund
ok "Backend dependencies installed"

if [ -d "viz" ] && [ -f "viz/package.json" ]; then
  cd viz
  npm install --silent --no-audit --no-fund
  ok "Dashboard dependencies installed"
  npm run build --silent
  ok "Dashboard built"
  cd "$LAVERN_HOME"
fi
echo

# ── Step 7: Configure .env for local-only ────────────────────────────────
say "Writing local-only configuration…"

if [ -f .env ]; then
  cp .env ".env.backup-$(date +%Y%m%d-%H%M%S)"
  ok "Existing .env backed up"
fi

cat > .env <<EOF
# Generated by Lavern installer on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
LAVERN_PROVIDER=local
LAVERN_LOCAL_URL=http://localhost:11434
LAVERN_LOCAL_DEFAULT_MODEL=$LAVERN_MODEL
LAVERN_LOCAL_ROUTER_MODEL=$LAVERN_MODEL
LAVERN_LOCAL_ASSEMBLY_MODEL=$LAVERN_MODEL

SHEM_PORT=$LAVERN_PORT
SHEM_HOST=127.0.0.1
SHEM_DB_PATH=$LAVERN_HOME/data/lavern.db
SHEM_LOG_LEVEL=info
EOF
ok "Wrote .env (provider=local, model=$LAVERN_MODEL, port=$LAVERN_PORT)"
echo

# ── Step 8: Launcher ─────────────────────────────────────────────────────
say "Creating launcher…"

LAUNCHER="$HOME/Applications/Lavern.command"
mkdir -p "$HOME/Applications"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
cd "$LAVERN_HOME"
export PATH="\$HOME/.nvm/versions/node/\$(ls \$HOME/.nvm/versions/node 2>/dev/null | sort -V | tail -1)/bin:\$PATH"
open "http://localhost:$LAVERN_PORT/dashboard/"
exec npx tsx src/index.ts --serve
EOF
chmod +x "$LAUNCHER"
ok "Launcher: $LAUNCHER"
echo

# ── Done ─────────────────────────────────────────────────────────────────
cat <<EOF

  ${GREEN}${BOLD}Lavern is installed.${NC}

  Source:    $LAVERN_HOME
  Launcher:  $LAUNCHER
  Dashboard: http://localhost:$LAVERN_PORT/dashboard/

  Starting the server now…

EOF

cd "$LAVERN_HOME"
sleep 1
open "http://localhost:$LAVERN_PORT/dashboard/" 2>/dev/null || true
exec npx tsx src/index.ts --serve
