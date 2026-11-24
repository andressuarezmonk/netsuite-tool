#!/usr/bin/env bash
# Safety net for VS Code releases: every installed Chrome extension reads the
# repository's "latest" release to detect updates, so that must always be a
# Chrome extension release (vX.Y.Z), never a VS Code one (ide-vX.Y.Z).
# If a VS Code release got marked latest, hand "latest" back to the newest
# Chrome release. Fails loudly if it can't be fixed.
#
# Usage: ensure-web-latest.sh <ide-tag>   (needs GH_TOKEN and GITHUB_REPOSITORY)

set -euo pipefail

IDE_TAG="${1:?usage: ensure-web-latest.sh <ide-tag>}"
LATEST_URL="repos/${GITHUB_REPOSITORY:?}/releases/latest"

latest_tag() { gh api "$LATEST_URL" --jq .tag_name; }

if [[ "$(latest_tag)" =~ ^v[0-9] ]]; then
  echo "OK: latest release is $(latest_tag)."
  exit 0
fi

echo "WARNING: latest release is $(latest_tag), not a Chrome extension release. Repairing…" >&2
gh release edit "$IDE_TAG" --latest=false
WEB_TAG=$(git tag --list 'v[0-9]*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
  | sort -t. -k1.2,1n -k2,2n -k3,3n | tail -n1)
gh release edit "$WEB_TAG" --latest

if [[ "$(latest_tag)" =~ ^v[0-9] ]]; then
  echo "Repaired: latest release is $(latest_tag) again."
  exit 0
fi
echo "ERROR: could not restore a Chrome extension release as 'latest'." >&2
exit 1
