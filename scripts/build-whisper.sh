#!/usr/bin/env bash
# build-whisper.sh — compile whisper.cpp from source and install into .caravel/whisper/bin/
#
# Invoked automatically when a smoke-test detects that the prebuilt binary is incompatible
# with the current CPU (e.g. SIGILL on AVX2-compiled binary on a pre-Haswell machine).
# Can also be run manually.
#
# Requirements: cmake (>=3.16), gcc/g++ or clang/clang++ (C++17), git, make/ninja
# The build auto-detects the host CPU — no explicit AVX2/FMA flags needed.
# To force a specific tier: set WHISPER_CMAKE_EXTRA="-DGGML_AVX2=OFF -DGGML_FMA=OFF"
#
# Usage:
#   bash scripts/build-whisper.sh
#   WHISPER_VERSION=v1.9.1 bash scripts/build-whisper.sh   # pin a release tag
#   WHISPER_CMAKE_EXTRA="-DGGML_AVX2=OFF -DGGML_FMA=OFF" bash scripts/build-whisper.sh

set -euo pipefail

WHISPER_VERSION="${WHISPER_VERSION:-v1.9.1}"
WHISPER_REPO="https://github.com/ggml-org/whisper.cpp.git"

# Resolve state dir: match whisper.ts resolveStateDir() — defaults to .caravel/ in workspace
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${CARAVEL_STATE_DIR:-${WORKSPACE}/.caravel}"
INSTALL_BIN="${STATE_DIR}/whisper/bin"
BUILD_TMP="${STATE_DIR}/whisper/tmp/build-src"

echo "[build-whisper] target: ${INSTALL_BIN}"
echo "[build-whisper] version: ${WHISPER_VERSION}"

# --- Prerequisite checks ---
check_tool() {
  if ! command -v "$1" &>/dev/null; then
    echo "[build-whisper] ERROR: '$1' not found."
    echo "  Install on Debian/Ubuntu: sudo apt-get install $2"
    echo "  Install on macOS: brew install $3"
    return 1
  fi
}

MISSING=0
check_tool cmake cmake cmake || MISSING=1
check_tool git git git || MISSING=1
if ! (command -v gcc &>/dev/null || command -v clang &>/dev/null); then
  echo "[build-whisper] ERROR: no C++ compiler found (need gcc or clang)"
  echo "  Install on Debian/Ubuntu: sudo apt-get install build-essential"
  echo "  Install on macOS: xcode-select --install"
  MISSING=1
fi
if [ "$MISSING" -eq 1 ]; then
  echo "[build-whisper] FATAL: missing prerequisites. See above."
  exit 1
fi

# --- Clone or update source ---
mkdir -p "${BUILD_TMP}"
SRC_DIR="${BUILD_TMP}/whisper.cpp"

if [ -d "${SRC_DIR}/.git" ]; then
  echo "[build-whisper] updating existing source..."
  git -C "${SRC_DIR}" fetch --tags --quiet
  git -C "${SRC_DIR}" checkout "${WHISPER_VERSION}" --quiet
else
  echo "[build-whisper] cloning whisper.cpp ${WHISPER_VERSION}..."
  git clone --depth 1 --branch "${WHISPER_VERSION}" "${WHISPER_REPO}" "${SRC_DIR}"
fi

# --- Configure and build ---
BUILD_DIR="${SRC_DIR}/build-host"
mkdir -p "${BUILD_DIR}"

CMAKE_ARGS=(
  -S "${SRC_DIR}"
  -B "${BUILD_DIR}"
  -DCMAKE_BUILD_TYPE=Release
  -DBUILD_SHARED_LIBS=ON
  -DWHISPER_BUILD_SERVER=OFF
  -DWHISPER_BUILD_TESTS=OFF
  -DWHISPER_BUILD_BENCHMARKS=OFF
)

# Let cmake auto-detect the host CPU (this is the key step — no AVX2/FMA on t620)
# Override with WHISPER_CMAKE_EXTRA if you need to force a specific tier.
if [ -n "${WHISPER_CMAKE_EXTRA:-}" ]; then
  echo "[build-whisper] extra cmake args: ${WHISPER_CMAKE_EXTRA}"
  # shellcheck disable=SC2086
  CMAKE_ARGS+=(${WHISPER_CMAKE_EXTRA})
fi

echo "[build-whisper] configuring..."
cmake "${CMAKE_ARGS[@]}"

NPROC=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)
echo "[build-whisper] building with ${NPROC} cores..."
cmake --build "${BUILD_DIR}" --config Release -j "${NPROC}"

# --- Install ---
mkdir -p "${INSTALL_BIN}"

# Copy whisper-cli
BINARY="${BUILD_DIR}/bin/whisper-cli"
if [ ! -f "${BINARY}" ]; then
  BINARY="${BUILD_DIR}/bin/main"  # older whisper.cpp names it 'main'
fi
if [ ! -f "${BINARY}" ]; then
  echo "[build-whisper] ERROR: could not find whisper-cli or main in ${BUILD_DIR}/bin"
  exit 1
fi
cp "${BINARY}" "${INSTALL_BIN}/whisper-cli"
chmod 755 "${INSTALL_BIN}/whisper-cli"
echo "[build-whisper] installed binary: ${INSTALL_BIN}/whisper-cli"

# Copy shared libraries into same directory as binary (RPATH $ORIGIN)
find "${BUILD_DIR}" -name "*.so" -o -name "*.so.*" -o -name "*.dylib" 2>/dev/null | while read -r lib; do
  cp "${lib}" "${INSTALL_BIN}/"
  echo "[build-whisper] installed lib: $(basename "${lib}")"
done

echo "[build-whisper] done. Binary installed at ${INSTALL_BIN}/whisper-cli"
echo "[build-whisper] restart the Caravel daemon to pick up the new binary."
