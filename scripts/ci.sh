#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run test:types
npm run test:generation
python3 -m unittest discover -s tests/jsr -p 'test_*.py' -v
bash scripts/check-jsr.sh
git diff --check
git diff --cached --check
