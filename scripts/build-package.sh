#!/usr/bin/env bash
#
# Build a clean Chrome Web Store package for FirstFire - Window Merger.
#
# Usage:
#   scripts/build-package.sh
#
# Output:
#   dist/firstfire-window-merger-<version>.zip
#
# The zip contains only the files the extension needs at runtime:
# manifest.json, background.js, LICENSE, and the icons referenced by the
# manifest. Tests, screenshots, repo tooling, and macOS junk never ship.
# Upload the zip via the Chrome Web Store Developer Dashboard.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

command -v node >/dev/null || { echo "error: node is required" >&2; exit 1; }
command -v zip  >/dev/null || { echo "error: zip is required"  >&2; exit 1; }

# Read the version and icon paths straight from the manifest so the
# package can never drift out of sync with manifest.json.
VERSION="$(node -p "require('./manifest.json').version")"
ICONS="$(node -e '
  const m = require("./manifest.json");
  const icons = {...(m.icons || {}), ...((m.action || {}).default_icon || {})};
  console.log([...new Set(Object.values(icons))].join(" "));
')"

# --- Preflight checks -------------------------------------------------------

node -e '
  const m = require("./manifest.json");
  const fail = (msg) => { console.error("error: " + msg); process.exit(1); };
  if (!/^\d+\.\d+\.\d+$/.test(m.version)) fail("invalid version: " + m.version);
  if (m.description.length > 132) {
    fail("description is " + m.description.length + " chars (Chrome Web Store limit: 132)");
  }
'

for icon in $ICONS; do
  [ -f "$icon" ] || { echo "error: icon referenced by manifest is missing: $icon" >&2; exit 1; }
done

if git rev-parse --git-dir >/dev/null 2>&1 && [ -n "$(git tag -l "v$VERSION")" ]; then
  echo "warning: git tag v$VERSION already exists - bump manifest.json before tagging a new release" >&2
fi

# --- Stage and zip ----------------------------------------------------------

NAME="firstfire-window-merger"
OUT="$REPO_ROOT/dist/$NAME-$VERSION.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp manifest.json background.js LICENSE "$STAGE/"
for icon in $ICONS; do
  mkdir -p "$STAGE/$(dirname "$icon")"
  cp "$icon" "$STAGE/$icon"
done

FILES=(manifest.json background.js LICENSE)
for icon in $ICONS; do FILES+=("$icon"); done

rm -f "$OUT"
mkdir -p "$(dirname "$OUT")"
(cd "$STAGE" && zip -q -X "$OUT" "${FILES[@]}")

echo "Built $OUT"
unzip -l "$OUT" | sed 's/^/  /'
shasum -a 256 "$OUT" | sed 's/^/  /'
