#!/usr/bin/env bash
# Prints the release notes for a VS Code extension tag: what changed in ide/
# and protocol/ since the previous VS Code release.
#
# Usage: ide-release-notes.sh <ide-tag>

set -euo pipefail

TAG="${1:?usage: ide-release-notes.sh <ide-tag>}"
VERSION="${TAG#ide-v}"

# Previous VS Code release = the ide-vX.Y.Z just before this one, compared
# numerically (empty for the first release)
PREVIOUS_TAG=$(git tag --list 'ide-v[0-9]*' \
  | grep -E '^ide-v[0-9]+\.[0-9]+\.[0-9]+$' \
  | sort -t. -k1.6,1n -k2,2n -k3,3n \
  | awk -v current="$TAG" '$0 == current { print previous; exit } { previous = $0 }')
RANGE="$TAG"
[[ -n "$PREVIOUS_TAG" ]] && RANGE="$PREVIOUS_TAG..$TAG"

MINIMUM=$(git show "$TAG:ide/src/constants.ts" \
  | sed -n 's/.*MIN_CHROME_EXTENSION_VERSION *= *"\([0-9.]*\)".*/\1/p' | head -n1)

echo "VS Code extension $VERSION"
echo
# 0.x versions are betas
if [[ "${VERSION%%.*}" == "0" ]]; then
  echo "> **Beta:** this extension is in beta, so you may run into rough edges. Please report problems by opening an issue."
  echo
fi
echo "Requires the NetSuite Fast Time Tracker Chrome extension v$MINIMUM or newer."
echo "Install: download the .vsix below, then in VS Code run \"Extensions: Install from VSIX…\"."
echo
echo "### Changes"
CHANGES=$(git log --no-merges --format='- %s (%h)' "$RANGE" -- ide protocol)
echo "${CHANGES:-- No changes recorded.}"
