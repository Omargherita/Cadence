#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

resolve_storage_root() {
    if [ -n "${CADENCE_STORAGE_ROOT:-}" ]; then
        printf '%s\n' "${CADENCE_STORAGE_ROOT}"
        return
    fi
    if [ -n "${Cadence__StorageRoot:-}" ]; then
        printf '%s\n' "${Cadence__StorageRoot}"
        return
    fi
    local appsettings="${REPO_ROOT}/src/Cadence.Api/appsettings.json"
    if [ -f "${appsettings}" ] && command -v python3 >/dev/null 2>&1; then
        local configured
        configured="$(python3 - "${appsettings}" <<'PY'
import json, sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
    root = (data.get("Cadence") or {}).get("StorageRoot") or ""
    if isinstance(root, str) and root.strip():
        print(root.strip())
except Exception:
    pass
PY
)"
        if [ -n "${configured}" ]; then
            printf '%s\n' "${configured}"
            return
        fi
    fi
    printf '%s\n' "${HOME}/.local/share/cadence"
}

STORAGE_ROOT="$(resolve_storage_root)"
DB_FILE="${STORAGE_ROOT}/db/app.db"
if [ ! -f "${DB_FILE}" ] && [ -f "${STORAGE_ROOT}/cadence.db" ]; then
    DB_FILE="${STORAGE_ROOT}/cadence.db"
fi
BACKUP_DIR="${STORAGE_ROOT}/backups"
MEDIA_DIR="${STORAGE_ROOT}/media"
RETENTION_COUNT="${CADENCE_BACKUP_RETENTION_COUNT:-30}"

if [ ! -f "${DB_FILE}" ]; then
    echo "Cadence database not found at ${DB_FILE}. Skipping backup."
    exit 0
fi

mkdir -p -m 700 "${STORAGE_ROOT}" "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

LOCK_FILE="${BACKUP_DIR}/.backup.lock"
exec 9>"${LOCK_FILE}"
chmod 600 "${LOCK_FILE}"
flock -w 60 9

TIMESTAMP="$(date -u +%Y%m%d_%H%M%S_%3N)"
RAND_SUFFIX="$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
BACKUP_NAME="cadence-${TIMESTAMP}-${RAND_SUFFIX}.db"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}"
STAGING_FILE="${BACKUP_DIR}/.${BACKUP_NAME}.tmp"

cleanup_staging() {
    if [ -n "${STAGING_FILE:-}" ] && [ -f "${STAGING_FILE}" ]; then
        rm -f "${STAGING_FILE}"
    fi
}
trap cleanup_staging EXIT

if [ -e "${BACKUP_FILE}" ] || [ -e "${STAGING_FILE}" ]; then
    echo "Error: Backup destination ${BACKUP_FILE} already exists." >&2
    exit 1
fi

echo "Creating atomic SQLite online backup to ${BACKUP_FILE}..."
ESCAPED_STAGING="${STAGING_FILE//\'/\'\'}"
sqlite3 "${DB_FILE}" ".backup '${ESCAPED_STAGING}'"
chmod 600 "${STAGING_FILE}"
mv -n "${STAGING_FILE}" "${BACKUP_FILE}"
chmod 600 "${BACKUP_FILE}"

# Note: SQLite database backups do NOT contain score PDFs or recorded takes.
# Copy the media directory separately into backups/media/.
# This is an additive copy, never a mirror: a missing or empty media source must
# never be able to erase media that was already backed up.
if [ ! -d "${MEDIA_DIR}" ]; then
    echo "Media directory ${MEDIA_DIR} not found; skipping media backup."
elif [ -z "$(find "${MEDIA_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    echo "Media directory ${MEDIA_DIR} is empty; skipping media backup."
else
    MEDIA_BACKUP_DIR="${BACKUP_DIR}/media"
    mkdir -p -m 700 "${MEDIA_BACKUP_DIR}"
    chmod 700 "${MEDIA_BACKUP_DIR}"
    if command -v rsync >/dev/null 2>&1; then
        rsync -a "${MEDIA_DIR}/" "${MEDIA_BACKUP_DIR}/"
    else
        cp -a "${MEDIA_DIR}/." "${MEDIA_BACKUP_DIR}/"
    fi
fi

# Retention policy: keep the newest RETENTION_COUNT database backups
if [[ "${RETENTION_COUNT}" =~ ^[0-9]+$ ]] && [ "${RETENTION_COUNT}" -gt 0 ]; then
    mapfile -t EXISTING_BACKUPS < <(
        find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name "cadence-*.db" -o -name "app_*.db" \) -printf '%f\n' | LC_ALL=C sort -r
    )
    if [ "${#EXISTING_BACKUPS[@]}" -gt "${RETENTION_COUNT}" ]; then
        for ((i = RETENTION_COUNT; i < ${#EXISTING_BACKUPS[@]}; i++)); do
            rm -f "${BACKUP_DIR}/${EXISTING_BACKUPS[$i]}"
        done
    fi
fi

echo "Backup completed successfully: $(du -h "${BACKUP_FILE}" | cut -f1)"
