#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT

git -C "$TEST_DIR" init -q
git -C "$TEST_DIR" config user.email delivery-gate-test@example.invalid
git -C "$TEST_DIR" config user.name "Delivery Gate Test"
printf 'test\n' > "$TEST_DIR/file.txt"
git -C "$TEST_DIR" add file.txt
git -C "$TEST_DIR" commit -qm "test: create delivery gate fixture"

if (
  cd "$TEST_DIR"
  DELIVERY_GATE_BYPASS_REASON="missing durable evidence" \
    bash "$ROOT_DIR/scripts/delivery-gate.sh" full
); then
  printf 'Expected a bypass without a commit trailer to fail.\n' >&2
  exit 1
fi

git -C "$TEST_DIR" commit --allow-empty -qm "chore: record delivery gate exception

Delivery-Gate-Bypass-Reason: test-only maintenance exception"
BYPASS_OUTPUT=$(
  cd "$TEST_DIR"
  DELIVERY_GATE_BYPASS_REASON="test-only maintenance exception" \
    bash "$ROOT_DIR/scripts/delivery-gate.sh" full
)
case "$BYPASS_OUTPUT" in
  *"Delivery gate bypassed: test-only maintenance exception"*) ;;
  *)
    printf 'Expected a matching commit-trailer bypass to be accepted.\n' >&2
    exit 1
    ;;
esac

git -C "$TEST_DIR" commit --allow-empty -qm "test: remove delivery gate exception"
if (
  cd "$TEST_DIR"
  DELIVERY_GATE_BASE_REF=origin/missing \
    bash "$ROOT_DIR/scripts/delivery-gate.sh" affected
); then
  printf 'Expected a missing affected-validation base ref to fail.\n' >&2
  exit 1
fi

printf 'Delivery gate bypass and missing-base tests passed.\n'
