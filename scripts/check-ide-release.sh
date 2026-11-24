#!/usr/bin/env bash
# Gate for publishing a VS Code extension release: refuses unless the Chrome
# extension it needs has already been released. This is what guarantees that
# nobody is offered the VS Code extension before the Chrome one it depends on.
#
# Usage: check-ide-release.sh <ide-tag> [revision-to-read-constants-from]
#   e.g. check-ide-release.sh ide-v0.2.0
# Needs tags fetched. Web releases are the `vX.Y.Z` tags reachable from
# origin/master (VS Code ones are `ide-vX.Y.Z`).

set -euo pipefail

TAG="${1:?usage: check-ide-release.sh <ide-tag> [revision]}"
REVISION="${2:-$TAG}"
CONSTANTS_FILE="ide/src/constants.ts"

if [[ ! "$TAG" =~ ^ide-v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: '$TAG' is not a VS Code release tag (expected ide-vX.Y.Z)." >&2
  exit 1
fi

MINIMUM=$(git show "$REVISION:$CONSTANTS_FILE" \
  | sed -n 's/.*MIN_CHROME_EXTENSION_VERSION *= *"\([0-9.]*\)".*/\1/p' | head -n1)
if [[ ! "$MINIMUM" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: couldn't read MIN_CHROME_EXTENSION_VERSION from $CONSTANTS_FILE." >&2
  exit 1
fi

# Highest web release on master, compared numerically (portable: no sort -V)
LATEST_WEB=$(git tag --merged origin/master --list 'v[0-9]*' \
  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
  | sed 's/^v//' \
  | sort -t. -k1,1n -k2,2n -k3,3n | tail -n1)
if [[ -z "$LATEST_WEB" ]]; then
  echo "ERROR: no Chrome extension release (vX.Y.Z) found on origin/master." >&2
  exit 1
fi

OLDEST=$(printf '%s\n%s\n' "$MINIMUM" "$LATEST_WEB" \
  | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)
if [[ "$OLDEST" != "$MINIMUM" ]]; then
  echo "ERROR: this VS Code extension needs Chrome extension v$MINIMUM or newer," >&2
  echo "       but the newest Chrome extension release is v$LATEST_WEB." >&2
  echo "       Release the Chrome extension first, then the VS Code one." >&2
  exit 1
fi

echo "OK: $TAG needs Chrome extension >= v$MINIMUM; v$LATEST_WEB is released."
