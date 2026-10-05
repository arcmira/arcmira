#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v deno >/dev/null
# Deno must already be installed; this script never downloads a toolchain.
staging_parent="$(mktemp -d "${TMPDIR:-/tmp}/arcmira-jsr-check.XXXXXX")"
trap 'rm -rf "$staging_parent"' EXIT
candidate="$staging_parent/candidate"
python3 scripts/prepare-jsr.py "$candidate"
(
  cd "$candidate"
  deno publish --dry-run --config jsr.json
  deno test --allow-net=127.0.0.1 candidate_test.ts
)
python3 scripts/check-jsr-exports.py "$candidate"
