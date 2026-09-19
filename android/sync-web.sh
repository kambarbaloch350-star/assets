#!/usr/bin/env bash
#
# Build the web game and copy it into the Android assets folder.
#
#   ./sync-web.sh          build + sync
#   ./sync-web.sh --clean  wipe the assets folder first
#
# The script also injects <script src="bridge.js"> into index.html so the
# native bridges are installed BEFORE the game bundle runs.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME_DIR="$(cd "$HERE/../game" && pwd)"
WWW_DIR="$HERE/app/src/main/assets/www"

echo "▸ building the web app…"
cd "$GAME_DIR"
npm run build

echo "▸ syncing into $WWW_DIR"
# bridge.js is SOURCE (tracked in git); everything else here is generated.
# Preserve it across the sync, and fail loudly if it has gone missing —
# without it the Android build silently ships a game with no native bridges.
if [[ ! -f "$WWW_DIR/bridge.js" ]]; then
  echo "✗ $WWW_DIR/bridge.js is missing — it is source, not build output." >&2
  echo "  Restore it with: git checkout android/app/src/main/assets/www/bridge.js" >&2
  exit 1
fi
BRIDGE="$(cat "$WWW_DIR/bridge.js")"
if [[ "${1:-}" == "--clean" ]]; then
  rm -rf "$WWW_DIR"
fi
mkdir -p "$WWW_DIR"
find "$WWW_DIR" -mindepth 1 -maxdepth 1 ! -name bridge.js -exec rm -rf {} +
cp -R "$GAME_DIR/dist/." "$WWW_DIR/"
printf '%s' "$BRIDGE" > "$WWW_DIR/bridge.js"

echo "▸ injecting bridge.js into index.html"
python3 - "$WWW_DIR/index.html" <<'PY'
import sys, re
p = sys.argv[1]
html = open(p, encoding='utf-8').read()
if 'bridge.js' in html:
    print('   already present')
else:
    tag = '<script src="./bridge.js"></script>'
    # Must execute before the game bundle. A classic script beats a deferred
    # module anyway, but inject it *above* the bundle so the order is obvious.
    m = re.search(r'\s*<script\b[^>]*type="module"[^>]*>', html)
    if m:
        html = html[:m.start()] + '\n    ' + tag + html[m.start():]
    else:
        html = html.replace('</head>', '  ' + tag + '\n</head>', 1)
    open(p, 'w', encoding='utf-8').write(html)
    print('   injected')
PY

echo "✓ done — now run:  ./gradlew :app:assembleRelease"
