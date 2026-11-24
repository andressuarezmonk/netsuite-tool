#!/usr/bin/env bash
# Publishes a VS Code extension release by pushing an `ide-vX.Y.Z` tag, which
# starts the "Release VS Code extension" workflow. Independent of the Chrome
# extension's release flow (deploy.sh), but refuses to run before the Chrome
# extension it needs has been released.
#
# Run via: npm run release:ide -- 0.1.0   (from ide/)   or   bash scripts/release-ide.sh 0.1.0

set -euo pipefail

info()  { echo "==> $*"; }
error() { echo "ERROR: $*" >&2; }

cd "$(git rev-parse --show-toplevel)"

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  error "Give the version to release, e.g.  npm run release:ide -- 0.1.0"
  exit 1
fi
TAG="ide-v$VERSION"

# ── 1. Release from master, clean and in sync with origin ──────────────────
if [[ "$(git rev-parse --abbrev-ref HEAD)" != "master" ]]; then
  error "Releases are cut from 'master' (currently on '$(git rev-parse --abbrev-ref HEAD)')."
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  error "Working tree is not clean. Commit or stash your changes first."
  exit 1
fi
info "Fetching latest refs and tags..."
git fetch --quiet origin master --tags
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/master)" ]]; then
  error "Local master differs from origin/master. Pull or push first."
  exit 1
fi
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  error "Tag $TAG already exists."
  exit 1
fi

# ── 2. The Chrome extension this needs must already be released ────────────
bash scripts/check-ide-release.sh "$TAG" HEAD

# ── 3. Local sanity check, so a broken build never reaches CI ──────────────
info "Type-checking the extension..."
npm --prefix ide run typecheck

# ── 4. Show what is about to ship, and confirm ─────────────────────────────
PREVIOUS_TAG=$(git tag --list 'ide-v[0-9]*' \
  | grep -E '^ide-v[0-9]+\.[0-9]+\.[0-9]+$' \
  | sort -t. -k1.6,1n -k2,2n -k3,3n | tail -n1 || true)
echo
info "Changes in this release (${PREVIOUS_TAG:-first release}..HEAD, ide/ and protocol/):"
git log --no-merges --format='  - %s (%h)' ${PREVIOUS_TAG:+$PREVIOUS_TAG..}HEAD -- ide protocol
echo
info "About to push tag $TAG. This publishes a GitHub release with the .vsix."
read -r -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  info "Aborted. No changes made."
  exit 1
fi

git tag -a "$TAG" -m "VS Code extension $VERSION"
git push origin "$TAG"
echo
info "Tag pushed. Watch the release workflow in the Actions tab."
