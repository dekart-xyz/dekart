#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
node scripts/check-dark.mjs
npx tsc -p src/client/dark
npx ts-standard -p src/client/dark/tsconfig.json 'src/client/dark/**/*.{ts,tsx}'
node scripts/dark-docs.mjs --check
