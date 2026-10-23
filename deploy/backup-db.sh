#!/usr/bin/env bash
set -euo pipefail

DB_DIR="${HOME}/.local/share/cadence"
DB_FILE="${DB_DIR}/db/app.db"
if [ ! -f "${DB_FILE}" ] && [ -f "${DB_DIR}/cadence.db" ]; then
    DB_FILE="${DB_DIR}/cadence.db"
fi
BACKUP_DIR="${DB_DIR}/backups"

if [ ! -f "${DB_FILE}" ]; then
    echo "Cadence database not found at ${DB_FILE}. Skipping backup."
    exit 0
fi

mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/cadence-${TIMESTAMP}.db"

echo "Creating atomic SQLite online backup to ${BACKUP_FILE}..."
sqlite3 "${DB_FILE}" ".backup '${BACKUP_FILE}'"

# Ensure permissions
chmod 600 "${BACKUP_FILE}"

# Keep last 30 daily backups
find "${BACKUP_DIR}" -name "cadence-*.db" -mtime +30 -delete

echo "Backup completed successfully: $(du -h "${BACKUP_FILE}" | cut -f1)"
