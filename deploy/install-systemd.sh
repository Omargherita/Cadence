#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"

mkdir -p "${SYSTEMD_USER_DIR}"

echo "Installing Cadence systemd user unit files to ${SYSTEMD_USER_DIR}..."
cp "${SCRIPT_DIR}/systemd/cadence.service" "${SYSTEMD_USER_DIR}/"
cp "${SCRIPT_DIR}/systemd/cadence-backup.service" "${SYSTEMD_USER_DIR}/"
cp "${SCRIPT_DIR}/systemd/cadence-backup.timer" "${SYSTEMD_USER_DIR}/"

echo "Reloading systemd user daemon..."
systemctl --user daemon-reload

echo "Enabling and starting cadence.service and cadence-backup.timer..."
systemctl --user enable --now cadence.service
systemctl --user enable --now cadence-backup.timer

echo "Status:"
systemctl --user status cadence.service --no-pager || true
systemctl --user list-timers --user | grep cadence || true
