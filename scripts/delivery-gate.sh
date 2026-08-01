#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-}"
BYPASS_REASON="${DELIVERY_GATE_BYPASS_REASON:-}"

if [[ -n "$BYPASS_REASON" ]]; then
  MESSAGE="Delivery gate bypassed: $BYPASS_REASON"
  printf '%s\n' "$MESSAGE"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '## Delivery gate bypass\n\n- Reason: %s\n' "$BYPASS_REASON" >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi

case "$MODE" in
  affected)
    BASE_REF="${DELIVERY_GATE_BASE_REF:-origin/main}"
    bun x turbo run check-types test build --filter="...[$BASE_REF]"
    ;;
  full)
    bun run check-types
    bun run test
    bun run build
    bun run check
    ;;
  *)
    printf 'Usage: %s {affected|full}\n' "$0" >&2
    exit 2
    ;;
esac
