#!/usr/bin/env bash
# Merges develop into master and pushes, triggering the GitHub Actions
# release workflow (lint -> semantic-release -> build -> dist.zip -> GitHub
# Release -> sync version bump back to develop).
#
# Run via: npm run deploy

set -euo pipefail

info()  { echo "==> $*"; }
error() { echo "ERROR: $*" >&2; }

# ── 1. Must be on develop ──────────────────────────────────────────────────
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
  error "You must be on 'develop' to deploy (currently on '$CURRENT_BRANCH')."
  exit 1
fi

# ── 2. Working tree must be clean ──────────────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
  error "Working tree is not clean. Commit or stash your changes first."
  git status --short
  exit 1
fi

# ── 3. Local sanity build, so a broken build never even reaches CI ────────
info "Running lint..."
npm run lint

info "Running build..."
npm run build

# ── 4. Sync refs and make sure local develop matches origin/develop ───────
info "Fetching latest refs from origin..."
git fetch origin develop master

LOCAL_DEVELOP=$(git rev-parse develop)
REMOTE_DEVELOP=$(git rev-parse origin/develop)
if [[ "$LOCAL_DEVELOP" != "$REMOTE_DEVELOP" ]]; then
  if git merge-base --is-ancestor origin/develop develop; then
    error "Local develop has commits not yet pushed to origin/develop."
    error "Push develop first (git push origin develop), then re-run npm run deploy."
    exit 1
  else
    error "Local develop and origin/develop have diverged. Resolve manually before deploying."
    exit 1
  fi
fi

# ── 5. Make sure master isn't ahead of develop (no unmerged master-only work) ─
if ! git merge-base --is-ancestor origin/master develop; then
  error "origin/master has commits that are not in develop."
  error "Merge/rebase master into develop before deploying."
  exit 1
fi

# ── 6. Confirm before the irreversible bit (push triggers a real release) ─
echo
info "About to merge 'develop' into 'master' and push to origin."
info "This will trigger the release workflow: lint, semantic-release version bump,"
info "build, and a published GitHub Release with dist.zip attached."
read -r -p "Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  info "Aborted. No changes made."
  exit 1
fi

# ── 7. Merge and push ──────────────────────────────────────────────────────
info "Checking out master..."
git checkout master
git pull origin master

info "Merging develop into master..."
git merge --no-ff develop -m "chore: merge develop into master for release"

info "Pushing master (this triggers the release workflow)..."
git push origin master

# ── 8. Back to develop ─────────────────────────────────────────────────────
info "Switching back to develop..."
git checkout develop

echo
info "Deploy triggered. Check the Actions tab for release progress:"
info "https://github.com/andressuarezmonk/netsuite-tool/actions"
info "CI will push a version-bump commit and merge it back into develop when done —"
info "run 'git pull origin develop' once it finishes."
