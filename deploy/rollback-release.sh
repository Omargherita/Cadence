#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${CADENCE_DEPLOY_DIR:-${SCRIPT_DIR}}"
RELEASES_DIR="${DEPLOY_DIR}/releases"
CURRENT_LINK="${DEPLOY_DIR}/current"
PREVIOUS_LINK="${DEPLOY_DIR}/previous"
PUBLISH_LINK="${DEPLOY_DIR}/publish"

if [ "$#" -ge 1 ]; then
    if [ -d "$1" ]; then
        TARGET_RELEASE="$(cd "$1" && pwd)"
    elif [ -d "${RELEASES_DIR}/$1" ]; then
        TARGET_RELEASE="$(cd "${RELEASES_DIR}/$1" && pwd)"
    else
        echo "Error: Specified release '$1' not found." >&2
        exit 1
    fi
else
    if [ ! -L "${PREVIOUS_LINK}" ] || [ ! -d "${PREVIOUS_LINK}" ]; then
        echo "Error: No previous release symlink found at ${PREVIOUS_LINK}." >&2
        exit 1
    fi
    TARGET_RELEASE="$(readlink -f "${PREVIOUS_LINK}")"
fi

if [ ! -f "${TARGET_RELEASE}/Cadence.Api" ] && [ ! -f "${TARGET_RELEASE}/Cadence.Api.dll" ]; then
    echo "Error: Target release ${TARGET_RELEASE} does not contain a valid Cadence.Api build." >&2
    exit 1
fi
if [ ! -f "${TARGET_RELEASE}/wwwroot/index.html" ]; then
    echo "Error: Target release ${TARGET_RELEASE} is missing wwwroot/index.html." >&2
    exit 1
fi

OLD_CURRENT=""
if [ -L "${CURRENT_LINK}" ] && [ -d "${CURRENT_LINK}" ]; then
    OLD_CURRENT="$(readlink -f "${CURRENT_LINK}")"
fi

ln -sfn "${TARGET_RELEASE}" "${CURRENT_LINK}.tmp"
mv -Tf "${CURRENT_LINK}.tmp" "${CURRENT_LINK}"

ln -sfn "${TARGET_RELEASE}" "${PUBLISH_LINK}.tmp"
mv -Tf "${PUBLISH_LINK}.tmp" "${PUBLISH_LINK}"

if [ -n "${OLD_CURRENT}" ] && [ "${OLD_CURRENT}" != "${TARGET_RELEASE}" ]; then
    ln -sfn "${OLD_CURRENT}" "${PREVIOUS_LINK}.tmp"
    mv -Tf "${PREVIOUS_LINK}.tmp" "${PREVIOUS_LINK}"
fi

echo "Rolled back active release:"
echo "  current -> ${TARGET_RELEASE}"
if [ -n "${OLD_CURRENT}" ]; then
    echo "  previous -> ${OLD_CURRENT}"
fi
echo "If cadence.service is running, restart it to apply:"
echo "  systemctl --user restart cadence.service"
