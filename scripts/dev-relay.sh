#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3001}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://${HOST}:${PORT}}"

LOOP_STUDY_AGENT_RUNTIME="${LOOP_STUDY_AGENT_RUNTIME:-relay}"

LOOP_STUDY_RELAY_API_URL="${LOOP_STUDY_RELAY_API_URL:-http://127.0.0.1:3000}"
LOOP_STUDY_RELAY_PROFILE="${LOOP_STUDY_RELAY_PROFILE:-default}"
LOOP_STUDY_RELAY_WORKSPACE_ID="${LOOP_STUDY_RELAY_WORKSPACE_ID:-}"
LOOP_STUDY_RELAY_TEMPLATE_PATH="${LOOP_STUDY_RELAY_TEMPLATE_PATH:-}"

export HOST
export PORT
export VITE_API_BASE_URL
export LOOP_STUDY_AGENT_RUNTIME
export LOOP_STUDY_RELAY_API_URL
export LOOP_STUDY_RELAY_PROFILE
export LOOP_STUDY_RELAY_WORKSPACE_ID
export LOOP_STUDY_RELAY_TEMPLATE_PATH

echo "Starting loop.study with Relay runtime"
echo "API: ${VITE_API_BASE_URL}"
echo "Relay: ${LOOP_STUDY_RELAY_API_URL}"
echo "Profile: ${LOOP_STUDY_RELAY_PROFILE}"
if [[ -n "${LOOP_STUDY_RELAY_WORKSPACE_ID}" ]]; then
  echo "Workspace override: ${LOOP_STUDY_RELAY_WORKSPACE_ID}"
fi
if [[ -n "${LOOP_STUDY_RELAY_TEMPLATE_PATH}" ]]; then
  echo "Template path: ${LOOP_STUDY_RELAY_TEMPLATE_PATH}"
fi

cd "${ROOT_DIR}"

pnpm dev:api &
api_pid=$!

cleanup() {
  kill "${api_pid}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

pnpm dev:frontend
