#!/usr/bin/env bash
#
# Run CLI integration tests against a local Anvil fork of Base.
#
# Usage:
#   bash test/run-tests.sh
#   npm test
#
set -euo pipefail

CLI_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANVIL_PORT="${ANVIL_PORT:-8545}"
FORK_URL="${FORK_URL:-https://mainnet.base.org}"
ANVIL_PID=""

cleanup() {
  if [ -n "$ANVIL_PID" ] && kill -0 "$ANVIL_PID" 2>/dev/null; then
    echo ""
    echo "Stopping anvil (pid $ANVIL_PID)..."
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "============================================"
echo "  ID CLI Integration Tests (Anvil Fork)"
echo "============================================"
echo ""
echo "Fork URL:  $FORK_URL"
echo "Anvil port: $ANVIL_PORT"
echo ""

# ── 1. Start anvil ────────────────────────────────────────────────────────────
echo "Starting anvil..."
anvil --fork-url "$FORK_URL" --port "$ANVIL_PORT" --silent &
ANVIL_PID=$!

# Wait for anvil to become ready (up to 30 seconds)
MAX_WAIT=30
WAITED=0
while ! curl -s -o /dev/null -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  "http://127.0.0.1:$ANVIL_PORT" 2>/dev/null; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "ERROR: Anvil did not start within ${MAX_WAIT}s"
    exit 1
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done
echo "Anvil ready (waited ${WAITED}s)"
echo ""

# ── 2. Set environment ───────────────────────────────────────────────────────
export PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
export RPC_URL="http://127.0.0.1:$ANVIL_PORT"

# ── 3. Run tests ──────────────────────────────────────────────────────────────
echo "Running tests..."
echo ""

npx tsx "$CLI_DIR/test/test.ts"
TEST_EXIT=$?

echo ""
if [ $TEST_EXIT -eq 0 ]; then
  echo "============================================"
  echo "  ALL TESTS PASSED"
  echo "============================================"
else
  echo "============================================"
  echo "  TESTS FAILED (exit code $TEST_EXIT)"
  echo "============================================"
fi

exit $TEST_EXIT
