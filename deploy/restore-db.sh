#!/usr/bin/env bash
set -euo pipefail
umask 077

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <path-to-backup.db>" >&2
    exit 1
fi

BACKUP_SOURCE="$1"
if [ ! -f "${BACKUP_SOURCE}" ]; then
    echo "Error: Backup file '${BACKUP_SOURCE}' does not exist." >&2
    exit 1
fi

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

# 1. Refuse to run while cadence.service is active
SERVICE_UNIT="${CADENCE_SERVICE_UNIT:-cadence.service}"
if [ "${CADENCE_SKIP_SERVICE_CHECK:-0}" != "1" ]; then
    if command -v systemctl >/dev/null 2>&1 && systemctl --user is-active --quiet "${SERVICE_UNIT}" 2>/dev/null; then
        echo "Error: ${SERVICE_UNIT} is currently active. Stop it first:" >&2
        echo "  systemctl --user stop ${SERVICE_UNIT}" >&2
        exit 1
    fi
fi

STORAGE_ROOT="$(resolve_storage_root)"
DB_DIR="${STORAGE_ROOT}/db"
BACKUP_DIR="${STORAGE_ROOT}/backups"
ACTIVE_DB="${DB_DIR}/app.db"

mkdir -p -m 700 "${STORAGE_ROOT}" "${DB_DIR}" "${BACKUP_DIR}"
chmod 700 "${DB_DIR}" "${BACKUP_DIR}"

LOCK_FILE="${BACKUP_DIR}/.backup.lock"
exec 9>"${LOCK_FILE}"
chmod 600 "${LOCK_FILE}"
flock -w 60 9

TIMESTAMP="$(date -u +%Y%m%d_%H%M%S_%3N)"
RAND_SUFFIX="$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
STAGED_DB="${DB_DIR}/.app.db.restore-${TIMESTAMP}-${RAND_SUFFIX}.tmp"

cleanup_staged() {
    rm -f "${STAGED_DB}" "${STAGED_DB}-wal" "${STAGED_DB}-shm"
}
trap cleanup_staged EXIT

# 2. Stage and verify the candidate backup BEFORE modifying the active database or sidecars
cp -f "${BACKUP_SOURCE}" "${STAGED_DB}"
chmod 600 "${STAGED_DB}"
rm -f "${STAGED_DB}-wal" "${STAGED_DB}-shm"

INTEGRITY_RESULT="$(sqlite3 "${STAGED_DB}" "PRAGMA integrity_check;" 2>&1 || true)"
if [ "${INTEGRITY_RESULT}" != "ok" ]; then
    echo "Error: Backup failed PRAGMA integrity_check: ${INTEGRITY_RESULT}" >&2
    echo "Aborting restore; active database was not modified." >&2
    exit 1
fi

FK_RESULT="$(sqlite3 "${STAGED_DB}" "PRAGMA foreign_key_check;" 2>&1 || true)"
if [ -n "${FK_RESULT}" ]; then
    echo "Error: Backup failed PRAGMA foreign_key_check:" >&2
    echo "${FK_RESULT}" >&2
    echo "Aborting restore; active database was not modified." >&2
    exit 1
fi

# 3. Preserve the current database and its -wal/-shm sidecars in a timestamped pre-restore folder
if [ -f "${ACTIVE_DB}" ] || [ -f "${ACTIVE_DB}-wal" ] || [ -f "${ACTIVE_DB}-shm" ]; then
    PRE_RESTORE_DIR="${BACKUP_DIR}/pre-restore/pre-restore-${TIMESTAMP}-${RAND_SUFFIX}"
    mkdir -p -m 700 "${BACKUP_DIR}/pre-restore" "${PRE_RESTORE_DIR}"
    chmod 700 "${BACKUP_DIR}/pre-restore" "${PRE_RESTORE_DIR}"

    for artifact in "${ACTIVE_DB}" "${ACTIVE_DB}-wal" "${ACTIVE_DB}-shm"; do
        if [ -f "${artifact}" ]; then
            cp -p "${artifact}" "${PRE_RESTORE_DIR}/$(basename "${artifact}")"
            chmod 600 "${PRE_RESTORE_DIR}/$(basename "${artifact}")"
        fi
    done
    echo "Archived current database and WAL/SHM sidecars to ${PRE_RESTORE_DIR}"
fi

# 4. Remove stale -wal/-shm sidecars and move verified database into place
rm -f "${ACTIVE_DB}-wal" "${ACTIVE_DB}-shm"
mv -f "${STAGED_DB}" "${ACTIVE_DB}"
chmod 600 "${ACTIVE_DB}"

# 5. Final verification on the restored destination
FINAL_INTEGRITY="$(sqlite3 "${ACTIVE_DB}" "PRAGMA integrity_check;" 2>&1 || true)"
if [ "${FINAL_INTEGRITY}" != "ok" ]; then
    echo "Error: Restored database failed final integrity check: ${FINAL_INTEGRITY}" >&2
    exit 1
fi

echo "Database successfully restored and verified at ${ACTIVE_DB}"
