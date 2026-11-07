#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_DIR="${CADENCE_DEPLOY_DIR:-${SCRIPT_DIR}}"
RELEASES_DIR="${DEPLOY_DIR}/releases"
KEEP_RELEASES="${CADENCE_KEEP_RELEASES:-3}"

TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
GIT_SHA="$(git -C "${PROJECT_ROOT}" rev-parse --short HEAD 2>/dev/null || echo "local")"
RAND_SUFFIX="$(head -c 3 /dev/urandom | od -An -tx1 | tr -d ' \n')"
RELEASE_ID="release-${TIMESTAMP}-${GIT_SHA}-${RAND_SUFFIX}"
STAGING_RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
RELEASE_ACTIVATED=0

cleanup_failed_release() {
    if [ "${RELEASE_ACTIVATED}" = "0" ] && [ -n "${STAGING_RELEASE_DIR:-}" ] && [ -d "${STAGING_RELEASE_DIR}" ]; then
        echo "Build failed before activation; removing incomplete release ${STAGING_RELEASE_DIR}..." >&2
        rm -rf "${STAGING_RELEASE_DIR}"
    fi
}
trap cleanup_failed_release EXIT

mkdir -p "${RELEASES_DIR}"
mkdir -p "${STAGING_RELEASE_DIR}"

WWWROOT_DIR="${PROJECT_ROOT}/src/Cadence.Api/wwwroot"
if [ "${CADENCE_SKIP_FRONTEND_BUILD:-0}" != "1" ]; then
    echo "=== [1/4] Building React PWA Frontend ==="
    (cd "${PROJECT_ROOT}/src/web-client" && npm run build)

    echo "=== [2/4] Syncing Compiled Web Assets to Cadence.Api/wwwroot ==="
    rm -rf "${WWWROOT_DIR}"
    mkdir -p "${WWWROOT_DIR}"
    cp -r "${PROJECT_ROOT}/src/web-client/dist/." "${WWWROOT_DIR}/"
fi

if [ "${CADENCE_SKIP_VENV_SETUP:-0}" != "1" ]; then
    echo "=== [3/4] Ensuring Python DSP Virtual Environment is Initialized ==="
    (
        cd "${PROJECT_ROOT}/tools/audio_analyzer"
        if [ ! -d ".venv" ]; then
            echo "Creating Python virtualenv at tools/audio_analyzer/.venv..."
            python3 -m venv .venv
            .venv/bin/pip install --upgrade pip
        fi
        .venv/bin/pip install -r requirements.txt
    )
fi

echo "=== [4/4] Publishing Cadence.Api Single-Port Binary into ${STAGING_RELEASE_DIR} ==="
if [ -z "${DOTNET_BIN:-}" ]; then
    if command -v dotnet >/dev/null 2>&1; then
        DOTNET_BIN="$(command -v dotnet)"
    elif [ -n "${DOTNET_ROOT:-}" ] && [ -x "${DOTNET_ROOT}/dotnet" ]; then
        DOTNET_BIN="${DOTNET_ROOT}/dotnet"
    elif [ -x "${HOME}/.dotnet/dotnet" ]; then
        DOTNET_BIN="${HOME}/.dotnet/dotnet"
    else
        DOTNET_BIN="dotnet"
    fi
fi

(cd "${PROJECT_ROOT}" && "${DOTNET_BIN}" publish src/Cadence.Api/Cadence.Api.csproj -c Release -o "${STAGING_RELEASE_DIR}")

# Ensure wwwroot and DSP worker assets are present inside the self-contained release directory
mkdir -p "${STAGING_RELEASE_DIR}/wwwroot"
if [ -d "${WWWROOT_DIR}" ]; then
    cp -r "${WWWROOT_DIR}/." "${STAGING_RELEASE_DIR}/wwwroot/"
fi

mkdir -p "${STAGING_RELEASE_DIR}/tools/audio_analyzer"
cp -f "${PROJECT_ROOT}/tools/audio_analyzer/analyze.py" "${STAGING_RELEASE_DIR}/tools/audio_analyzer/analyze.py"
cp -f "${PROJECT_ROOT}/tools/audio_analyzer/requirements.txt" "${STAGING_RELEASE_DIR}/tools/audio_analyzer/requirements.txt"
if [ -d "${PROJECT_ROOT}/tools/audio_analyzer/.venv" ] && [ ! -e "${STAGING_RELEASE_DIR}/tools/audio_analyzer/.venv" ]; then
    ln -s "${PROJECT_ROOT}/tools/audio_analyzer/.venv" "${STAGING_RELEASE_DIR}/tools/audio_analyzer/.venv"
fi

# Verify staged release integrity before switching symlinks
if [ ! -x "${STAGING_RELEASE_DIR}/Cadence.Api" ] && [ ! -f "${STAGING_RELEASE_DIR}/Cadence.Api.dll" ]; then
    echo "Error: Published binary missing in ${STAGING_RELEASE_DIR}." >&2
    exit 1
fi
if [ ! -f "${STAGING_RELEASE_DIR}/wwwroot/index.html" ]; then
    echo "Error: Compiled frontend wwwroot/index.html missing in ${STAGING_RELEASE_DIR}." >&2
    exit 1
fi
if [ ! -f "${STAGING_RELEASE_DIR}/tools/audio_analyzer/analyze.py" ]; then
    echo "Error: Bundled DSP worker analyze.py missing in ${STAGING_RELEASE_DIR}." >&2
    exit 1
fi

CURRENT_LINK="${DEPLOY_DIR}/current"
PREVIOUS_LINK="${DEPLOY_DIR}/previous"
PUBLISH_LINK="${DEPLOY_DIR}/publish"

# Preserve existing active release as `previous` for rollback
if [ -L "${CURRENT_LINK}" ] && [ -d "${CURRENT_LINK}" ]; then
    PREV_TARGET="$(readlink -f "${CURRENT_LINK}")"
    if [ "${PREV_TARGET}" != "${STAGING_RELEASE_DIR}" ]; then
        ln -sfn "${PREV_TARGET}" "${PREVIOUS_LINK}.tmp"
        mv -Tf "${PREVIOUS_LINK}.tmp" "${PREVIOUS_LINK}"
    fi
elif [ -d "${PUBLISH_LINK}" ] && [ ! -L "${PUBLISH_LINK}" ]; then
    # Migrate legacy directory deploy/publish into releases/ so it can be rolled back to
    LEGACY_HOLD="${RELEASES_DIR}/release-legacy-${TIMESTAMP}"
    mv "${PUBLISH_LINK}" "${LEGACY_HOLD}"
    ln -sfn "${LEGACY_HOLD}" "${PREVIOUS_LINK}.tmp"
    mv -Tf "${PREVIOUS_LINK}.tmp" "${PREVIOUS_LINK}"
fi

# Atomically activate the new release
ln -sfn "${STAGING_RELEASE_DIR}" "${CURRENT_LINK}.tmp"
mv -Tf "${CURRENT_LINK}.tmp" "${CURRENT_LINK}"

ln -sfn "${STAGING_RELEASE_DIR}" "${PUBLISH_LINK}.tmp"
mv -Tf "${PUBLISH_LINK}.tmp" "${PUBLISH_LINK}"

RELEASE_ACTIVATED=1

# Prune older release directories while keeping current, previous, and the latest KEEP_RELEASES
CURRENT_REAL="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"
PREVIOUS_REAL="$(readlink -f "${PREVIOUS_LINK}" 2>/dev/null || true)"
mapfile -t ALL_RELEASES < <(
    find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -name "release-*" -printf '%f\n' | LC_ALL=C sort -r
)
if [ "${#ALL_RELEASES[@]}" -gt "${KEEP_RELEASES}" ]; then
    for ((i = KEEP_RELEASES; i < ${#ALL_RELEASES[@]}; i++)); do
        CANDIDATE="${RELEASES_DIR}/${ALL_RELEASES[$i]}"
        CANDIDATE_REAL="$(readlink -f "${CANDIDATE}" 2>/dev/null || true)"
        if [ "${CANDIDATE_REAL}" != "${CURRENT_REAL}" ] && [ "${CANDIDATE_REAL}" != "${PREVIOUS_REAL}" ]; then
            rm -rf "${CANDIDATE}"
        fi
    done
fi

echo "================================================================="
echo " Cadence production release activated!"
echo " Release:  ${STAGING_RELEASE_DIR}"
echo " Active:   ${CURRENT_LINK} -> $(readlink -f "${CURRENT_LINK}")"
if [ -L "${PREVIOUS_LINK}" ]; then
    echo " Previous: ${PREVIOUS_LINK} -> $(readlink -f "${PREVIOUS_LINK}")"
fi
echo " To run standalone (loopback default):"
echo "   ${CURRENT_LINK}/Cadence.Api --urls \"http://127.0.0.1:5006\""
echo " To roll back:"
echo "   ./deploy/rollback-release.sh"
echo "================================================================="
