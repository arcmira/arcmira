#!/usr/bin/env bash
# Regenerate src/, reference.md and cli/operations.ts. Pass a spec path to vendor it into fern/openapi.json first.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ $# -gt 0 ]; then cp "$1" fern/openapi.json; fi
export FERN_NO_VERSION_REDIRECTION=true
export DO_NOT_TRACK=1
python3 scripts/prepare-openapi.py
version="$(node -p "require('./package.json').version")"
npm exec --yes --package=fern-api@5.131.1 -- fern generate --local --group typescript --version "$version" --force --no-prompt
python3 scripts/install-generated.py
python3 scripts/build-reference.py
