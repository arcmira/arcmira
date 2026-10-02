#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export FERN_NO_VERSION_REDIRECTION=true
export DO_NOT_TRACK=1
python3 scripts/prepare-openapi.py
version="$(node -p "require('./package.json').version")"
npm exec --yes --package=fern-api@5.131.1 -- fern generate --local --group typescript --version "$version" --force --no-prompt
python3 scripts/install-generated.py
python3 scripts/build-reference.py
