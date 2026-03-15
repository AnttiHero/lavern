# ── Stage 1: Build frontend ──────────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/viz
COPY viz/package*.json ./
RUN npm ci --ignore-scripts
COPY viz/ ./
RUN npm run build

# ── Stage 2: Build API ──────────────────────────────────────────────────
FROM node:20-slim AS api-build

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ src/
# TypeScript type-check (non-emit — we use tsx at runtime)
# RUN npx tsc --noEmit

# ── Stage 3: Runtime ────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Install better-sqlite3 build deps (needed for native module)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install production deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source (we run TypeScript via tsx — no compile step needed)
COPY tsconfig.json ./
COPY src/ src/
COPY SOUL.md ./

# Copy built frontend
COPY --from=frontend-build /app/viz/dist viz/dist

# Data directory for SQLite
RUN mkdir -p /app/data /app/audit-logs

# Environment defaults
ENV NODE_ENV=production
ENV SHEM_HOST=0.0.0.0
ENV SHEM_PORT=3000
ENV SHEM_DB_PATH=/app/data/whiteshoe.db
ENV SHEM_AUDIT_DIR=/app/audit-logs
ENV SHEM_CORS_ORIGINS=*

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["npx", "tsx", "src/index.ts", "--serve"]
