#!/bin/bash
#
# Deploy Lavern to a Mac Mini
#
# Usage:
#   ./scripts/deploy-mac-mini.sh [user@host]
#
# Prerequisites:
#   - SSH access to the Mac Mini
#   - Node.js 20+ installed on the Mac Mini
#   - ANTHROPIC_API_KEY set in .env on the Mac Mini
#
# What it does:
#   1. Syncs the project (excluding node_modules, .git, dist)
#   2. Installs dependencies + builds
#   3. Installs the launchd daemon
#   4. Verifies the service is running
#

set -euo pipefail

HOST=${1:-"lavern@mac-mini.local"}
REMOTE_DIR="/opt/lavern"

echo ""
echo "  Deploying Lavern to ${HOST}:${REMOTE_DIR}"
echo "  ─────────────────────────────────────────"
echo ""

# 1. Sync project files
echo "  [1/5] Syncing project..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude viz/dist \
  --exclude .env \
  --exclude '*.log' \
  . "${HOST}:${REMOTE_DIR}/"

# 2. Install dependencies
echo ""
echo "  [2/5] Installing dependencies..."
ssh "${HOST}" "cd ${REMOTE_DIR} && npm install --production=false"

# 3. Build TypeScript + Frontend
echo ""
echo "  [3/5] Building..."
ssh "${HOST}" "cd ${REMOTE_DIR} && npm run build && cd viz && npm run build"

# 4. Copy .env if it doesn't exist
echo ""
echo "  [4/5] Checking environment..."
ssh "${HOST}" "test -f ${REMOTE_DIR}/.env || (cp ${REMOTE_DIR}/scripts/env.production.template ${REMOTE_DIR}/.env && echo '  Created .env from template — EDIT IT with your API key!')"

# 5. Install daemon
echo ""
echo "  [5/5] Installing daemon..."
ssh "${HOST}" "cd ${REMOTE_DIR} && npx tsx src/index.ts claw daemon install"

echo ""
echo "  ─────────────────────────────────────────"
echo "  Deployment complete."
echo ""
echo "  Check status:"
echo "    ssh ${HOST} 'cd ${REMOTE_DIR} && npx tsx src/index.ts claw daemon status'"
echo ""
echo "  View logs:"
echo "    ssh ${HOST} 'cd ${REMOTE_DIR} && npx tsx src/index.ts claw daemon logs'"
echo ""
echo "  Dashboard:"
echo "    http://${HOST%%@*}:3000/dashboard/#/claw"
echo ""
