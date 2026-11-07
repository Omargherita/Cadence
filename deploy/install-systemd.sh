#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INSTALL_ROOT="${CADENCE_INSTALL_ROOT:-${PROJECT_ROOT}}"
SYSTEMD_USER_DIR="${CADENCE_SYSTEMD_USER_DIR:-${HOME}/.config/systemd/user}"
ENV_FILE="${CADENCE_ENV_FILE:-${HOME}/.config/cadence/cadence.env}"
RENDER_ONLY=0

if [ "${1:-}" = "--render-only" ]; then
    RENDER_ONLY=1
fi

mkdir -p "${SYSTEMD_USER_DIR}"
mkdir -p -m 700 "$(dirname "${ENV_FILE}")"

if [ ! -f "${ENV_FILE}" ] && [ -f "${PROJECT_ROOT}/.env.example" ]; then
    echo "Creating initial environment file at ${ENV_FILE} (mode 0600)..."
    cp "${PROJECT_ROOT}/.env.example" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
fi

echo "Rendering Cadence systemd user unit files (install root: ${INSTALL_ROOT}) to ${SYSTEMD_USER_DIR}..."
sed "s|%h/.local/opt/cadence|${INSTALL_ROOT}|g" \
    "${SCRIPT_DIR}/systemd/cadence.service" > "${SYSTEMD_USER_DIR}/cadence.service"

sed "s|%h/.local/opt/cadence|${INSTALL_ROOT}|g" \
    "${SCRIPT_DIR}/systemd/cadence-backup.service" > "${SYSTEMD_USER_DIR}/cadence-backup.service"

cp "${SCRIPT_DIR}/systemd/cadence-backup.timer" "${SYSTEMD_USER_DIR}/cadence-backup.timer"

if [ "${RENDER_ONLY}" = "1" ]; then
    echo "Rendered units in ${SYSTEMD_USER_DIR} (--render-only)."
    exit 0
fi

echo "Reloading systemd user daemon..."
systemctl --user daemon-reload

echo "Enabling and starting cadence.service and cadence-backup.timer..."
systemctl --user enable --now cadence.service
systemctl --user enable --now cadence-backup.timer

echo "Status:"
systemctl --user status cadence.service --no-pager || true
systemctl --user list-timers --user | grep cadence || true
