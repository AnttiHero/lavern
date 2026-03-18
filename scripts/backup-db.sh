#!/usr/bin/env bash
#
# Lavern — SQLite Database Backup
#
# Creates a timestamped backup of the production database using SQLite's
# built-in .backup command (safe for concurrent reads/writes).
#
# Usage:
#   ./scripts/backup-db.sh                          # Default: ./data/lavern.db → ./backups/
#   ./scripts/backup-db.sh /path/to/lavern.db       # Custom source path
#   DB_BACKUP_DIR=/mnt/nas/backups ./scripts/backup-db.sh  # Custom backup dir
#
# Retention: Keeps last 30 daily backups, deletes older ones.
#
# Cron example (daily at 3 AM):
#   0 3 * * * /opt/lavern/scripts/backup-db.sh >> /var/log/lavern-backup.log 2>&1

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────

DB_PATH="${1:-./data/lavern.db}"
BACKUP_DIR="${DB_BACKUP_DIR:-./backups}"
RETAIN_DAYS="${DB_BACKUP_RETAIN_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/lavern_${TIMESTAMP}.db"

# ── Validation ───────────────────────────────────────────────────────────

if [ ! -f "$DB_PATH" ]; then
  echo "[BACKUP] ERROR: Database not found: $DB_PATH"
  exit 1
fi

if ! command -v sqlite3 &>/dev/null; then
  echo "[BACKUP] ERROR: sqlite3 not found. Install: apt-get install sqlite3"
  exit 1
fi

# ── Create backup ────────────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"

echo "[BACKUP] Starting backup: $DB_PATH → $BACKUP_FILE"

# Use SQLite's .backup command for safe online backup (handles WAL correctly)
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Verify backup is valid
if sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[BACKUP] Success: $BACKUP_FILE ($SIZE)"
else
  echo "[BACKUP] ERROR: Backup integrity check failed!"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# ── Rotate old backups ───────────────────────────────────────────────────

DELETED=$(find "$BACKUP_DIR" -name "lavern_*.db" -mtime +"$RETAIN_DAYS" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[BACKUP] Rotated $DELETED backup(s) older than $RETAIN_DAYS days"
fi

# ── Summary ──────────────────────────────────────────────────────────────

TOTAL=$(find "$BACKUP_DIR" -name "lavern_*.db" | wc -l)
echo "[BACKUP] Total backups retained: $TOTAL"
