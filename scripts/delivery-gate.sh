#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-}"
COMMIT_MESSAGE="$(git log -1 --format=%B)"
BYPASS_TRAILER=""
while IFS= read -r trailer; do
  case "$trailer" in
    "Delivery-Gate-Bypass-Reason: "*)
      BYPASS_TRAILER="${trailer#Delivery-Gate-Bypass-Reason: }"
      ;;
  esac
done < <(printf '%s\n' "$COMMIT_MESSAGE" | git interpret-trailers --parse)

if [[ -n "$BYPASS_TRAILER" && -z "${DELIVERY_GATE_BYPASS_REASON:-}" ]]; then
  printf 'A Delivery-Gate-Bypass-Reason commit trailer requires DELIVERY_GATE_BYPASS_REASON.\n' >&2
  exit 1
fi

if [[ -n "${DELIVERY_GATE_BYPASS_REASON:-}" ]]; then
  if [[ -z "$BYPASS_TRAILER" ]]; then
    printf 'A bypass reason requires a Delivery-Gate-Bypass-Reason commit trailer.\n' >&2
    exit 1
  fi
  if [[ "$BYPASS_TRAILER" != "$DELIVERY_GATE_BYPASS_REASON" ]]; then
    printf 'The requested bypass reason does not match the commit trailer.\n' >&2
    exit 1
  fi
fi

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
    if ! git rev-parse --verify "$BASE_REF^{commit}" >/dev/null 2>&1; then
      printf 'Unable to resolve affected validation base ref: %s. Fetch the base branch or set DELIVERY_GATE_BASE_REF.\n' "$BASE_REF" >&2
      exit 1
    fi
    bun x turbo run check-types test build --filter="...[$BASE_REF]"
    ;;
  full)
    bun run test:delivery-gate
    bun run check-types
    bun run test
    bun run build
    bun run lint:baseline
    ;;
  *)
    printf 'Usage: %s {affected|full}\n' "$0" >&2
    exit 2
    ;;
esac
