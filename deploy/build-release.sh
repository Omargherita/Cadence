#!/usr/bin/env bash
set -euo pipefail

# Determine project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== [1/4] Building React PWA Frontend ==="
cd "${PROJECT_ROOT}/src/web-client"
npm run build

echo "=== [2/4] Syncing Compiled Web Assets to Cadence.Api/wwwroot ==="
WWWROOT_DIR="${PROJECT_ROOT}/src/Cadence.Api/wwwroot"
rm -rf "${WWWROOT_DIR}"
mkdir -p "${WWWROOT_DIR}"
cp -r "${PROJECT_ROOT}/src/web-client/dist/." "${WWWROOT_DIR}/"

echo "=== [3/4] Ensuring Python DSP Virtual Environment is Initialized ==="
cd "${PROJECT_ROOT}/tools/audio_analyzer"
if [ ! -d ".venv" ]; then
    echo "Creating Python virtualenv at tools/audio_analyzer/.venv..."
    python3 -m venv .venv
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install -r requirements.txt
fi

echo "=== [4/4] Publishing Cadence.Api Single-Port Binary ==="
cd "${PROJECT_ROOT}"
DOTNET_BIN="${DOTNET_ROOT:-/home/omar/.dotnet}/dotnet"
if [ ! -x "${DOTNET_BIN}" ]; then
    DOTNET_BIN="dotnet"
fi

PUBLISH_DIR="${PROJECT_ROOT}/deploy/publish"
rm -rf "${PUBLISH_DIR}"
"${DOTNET_BIN}" publish src/Cadence.Api/Cadence.Api.csproj -c Release -o "${PUBLISH_DIR}"

# Ensure wwwroot is present in publish output
mkdir -p "${PUBLISH_DIR}/wwwroot"
cp -r "${WWWROOT_DIR}/." "${PUBLISH_DIR}/wwwroot/"

echo "================================================================="
echo " Cadence production build completed successfully!"
echo " Published to: ${PUBLISH_DIR}"
echo " To run standalone:"
echo "   cd ${PROJECT_ROOT} && ${PUBLISH_DIR}/Cadence.Api --urls \"http://0.0.0.0:5006\""
echo "================================================================="
