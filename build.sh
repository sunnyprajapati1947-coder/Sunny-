#!/usr/bin/env bash
# Vercel build (project: jarvis-pocket). The phone app is plain static files, so
# "building" means copying apps/jarvis-pocket into the output directory.
set -euo pipefail
rm -rf dist
mkdir -p dist
cp -r apps/jarvis-pocket/. dist/
rm -f dist/sw.js.orig
test -f dist/install.html
test -f dist/vendor/transformers/ort-wasm-simd-threaded.jsep.wasm
test -f dist/assets/js/local-brain.js
echo "staged $(du -sh dist | cut -f1) into dist/"
