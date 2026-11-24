#!/usr/bin/env bash
# Deploys the Chrome extension (web), the VS Code extension (ide), or both.
#
#   npm run deploy               from web/ -> deploys the Chrome extension
#   npm run deploy               from ide/ -> deploys the VS Code extension
#   npm run deploy               from the repo root -> asks what to deploy
#   npm run deploy:web | deploy:ide | deploy:both     (repo root)
#
# Extra arguments (after `--`):  0.2.0   VS Code version (otherwise suggested)
#                                -y      skip the confirmation prompts
#
# web   merges develop into master; CI then releases the Chrome extension if
#       there is anything releasable (feat:/fix:/perf:, not `(ide)`-scoped).
# ide   makes sure master has develop, then tags ide-vX.Y.Z; CI publishes the
#       .vsix. Refuses if that merge would also release the Chrome extension —
#       that is "both".
# both  web first, waits for the Chrome release to exist, then the VS Code one.
#       The Chrome extension always goes first.
#
# Everything is planned and confirmed once, BEFORE anything is pushed.

set -euo pipefail

info()  { echo "==> $*"; }
warn()  { echo "WARNING: $*" >&2; }
error() { echo "ERROR: $*" >&2; }

usage() {
  echo "Usage: deploy.sh [web|ide|both] [X.Y.Z] [-y]" >&2
}

# ── Arguments ──────────────────────────────────────────────────────────────
MODE=""
ASSUME_YES=0
REQUESTED_IDE_VERSION=""
for argument in "$@"; do
  case "$argument" in
    web|ide|both) MODE="$argument" ;;
    -y|--yes)     ASSUME_YES=1 ;;
    [0-9]*.[0-9]*.[0-9]*) REQUESTED_IDE_VERSION="$argument" ;;
    *) error "Unknown argument: $argument"; usage; exit 1 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

confirm() {
  if [[ "$ASSUME_YES" == "1" ]]; then return 0; fi
  local reply
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

if [[ -z "$MODE" ]]; then
  if [[ "$ASSUME_YES" == "1" ]]; then error "Say what to deploy: web, ide or both."; exit 1; fi
  read -r -p "What do you want to deploy? [web/ide/both] " MODE
  case "$MODE" in web|ide|both) ;; *) error "Choose web, ide or both."; exit 1 ;; esac
fi

# ── Version helpers (numeric, portable: no sort -V) ────────────────────────
latest_tag() {  # $1 = glob (v[0-9]*), $2 = regex, $3 = sort key for the first number
  git tag --merged origin/master --list "$1" | grep -E "$2" \
    | sort -t. -k"$3",1n -k2,2n -k3,3n | tail -n1 || true
}
latest_web_tag() { latest_tag 'v[0-9]*'     '^v[0-9]+\.[0-9]+\.[0-9]+$'     1.2; }
latest_ide_tag() { latest_tag 'ide-v[0-9]*' '^ide-v[0-9]+\.[0-9]+\.[0-9]+$' 1.6; }

# True when version $1 is older than version $2
version_lt() {
  [[ "$1" != "$2" && "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)" == "$1" ]]
}

bump_version() {  # $1 = X.Y.Z, $2 = major|minor|patch
  local major minor patch
  IFS=. read -r major minor patch <<< "$1"
  case "$2" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    *)     echo "$major.$minor.$((patch + 1))" ;;
  esac
}

bump_rank() { case "$1" in major) echo 3 ;; minor) echo 2 ;; patch) echo 1 ;; *) echo 0 ;; esac; }

# ── Preconditions: develop is clean, pushed, and master has nothing extra ──
check_branches() {
  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$current_branch" != "develop" ]]; then
    error "You must be on 'develop' to deploy (currently on '$current_branch')."
    exit 1
  fi
  if [[ -n "$(git status --porcelain)" ]]; then
    error "Working tree is not clean. Commit or stash your changes first."
    git status --short
    exit 1
  fi
  info "Fetching latest refs and tags from origin..."
  git fetch --quiet origin develop master --tags
  if [[ "$(git rev-parse develop)" != "$(git rev-parse origin/develop)" ]]; then
    if git merge-base --is-ancestor origin/develop develop; then
      error "Local develop has commits not yet pushed. Run: git push origin develop"
    else
      error "Local develop and origin/develop have diverged. Resolve manually first."
    fi
    exit 1
  fi
  if ! git merge-base --is-ancestor origin/master develop; then
    error "origin/master has commits that are not in develop."
    error "If a release just finished, CI is syncing it back: wait a moment, then run"
    error "'git pull origin develop'. Otherwise merge/rebase master into develop."
    exit 1
  fi
}

# ── What would the Chrome extension release contain? ───────────────────────
# Mirrors semantic-release's rules (see web/.releaserc.json): feat -> minor,
# fix/perf -> patch, a BREAKING CHANGE -> major; `(ide)`-scoped commits never
# release the Chrome extension. A prediction: the real decision is CI's.
WEB_BUMP=""
WEB_COMMIT_LINES=""
WEB_LAST_TAG=""
WEB_NEXT_VERSION=""

predict_web_release() {
  WEB_LAST_TAG=$(latest_web_tag)
  WEB_BUMP=""
  WEB_COMMIT_LINES=""
  local range="develop"
  [[ -n "$WEB_LAST_TAG" ]] && range="$WEB_LAST_TAG..develop"

  local sha subject type scope bump
  while read -r sha; do
    [[ -z "$sha" ]] && continue
    subject=$(git log -1 --format=%s "$sha")
    type=""; scope=""
    if [[ "$subject" =~ ^([a-z]+)(\(([^\)]*)\))?!?:\  ]]; then
      type="${BASH_REMATCH[1]}"; scope="${BASH_REMATCH[3]}"
    fi
    [[ "$scope" == "ide" ]] && continue
    bump=""
    if git log -1 --format=%B "$sha" | grep -qE '^BREAKING[ -]CHANGE'; then
      bump=major
    else
      case "$type" in feat) bump=minor ;; fix|perf) bump=patch ;; esac
    fi
    [[ -z "$bump" ]] && continue
    WEB_COMMIT_LINES="${WEB_COMMIT_LINES}  - $subject (${sha:0:7})"$'\n'
    if (( $(bump_rank "$bump") > $(bump_rank "$WEB_BUMP") )); then WEB_BUMP="$bump"; fi
  done < <(git log --no-merges --format=%H $range)

  WEB_NEXT_VERSION=""
  if [[ -n "$WEB_BUMP" ]]; then
    WEB_NEXT_VERSION=$(bump_version "${WEB_LAST_TAG#v}" "$WEB_BUMP")
  fi
}

# ── What would the VS Code release contain? ────────────────────────────────
IDE_LAST_TAG=""
IDE_COMMIT_LINES=""
IDE_VERSION=""

plan_ide_release() {
  IDE_LAST_TAG=$(latest_ide_tag)
  local range="develop"
  [[ -n "$IDE_LAST_TAG" ]] && range="$IDE_LAST_TAG..develop"
  IDE_COMMIT_LINES=$(git log --no-merges --format='  - %s (%h)' $range -- ide protocol)
  if [[ -z "$IDE_COMMIT_LINES" ]]; then
    error "No changes to ide/ or protocol/ since ${IDE_LAST_TAG:-the start}: nothing to release."
    exit 1
  fi

  if [[ -n "$REQUESTED_IDE_VERSION" ]]; then
    IDE_VERSION="$REQUESTED_IDE_VERSION"
  elif [[ -z "$IDE_LAST_TAG" ]]; then
    IDE_VERSION="0.1.0"
  elif git log --no-merges --format=%s $range -- ide protocol | grep -qE '^feat'; then
    IDE_VERSION=$(bump_version "${IDE_LAST_TAG#ide-v}" minor)
  else
    IDE_VERSION=$(bump_version "${IDE_LAST_TAG#ide-v}" patch)
  fi

  if [[ -z "$REQUESTED_IDE_VERSION" && "$ASSUME_YES" != "1" ]]; then
    local answer
    read -r -p "VS Code extension version [$IDE_VERSION]: " answer
    [[ -n "$answer" ]] && IDE_VERSION="$answer"
  fi
  if [[ ! "$IDE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    error "'$IDE_VERSION' is not a version like 0.2.0."
    exit 1
  fi
  if git rev-parse -q --verify "refs/tags/ide-v$IDE_VERSION" >/dev/null \
     || [[ -n "$(git ls-remote --tags origin "refs/tags/ide-v$IDE_VERSION")" ]]; then
    error "Tag ide-v$IDE_VERSION already exists."
    exit 1
  fi
}

ide_min_chrome_version() {
  git show develop:ide/src/constants.ts \
    | sed -n 's/.*MIN_CHROME_EXTENSION_VERSION *= *"\([0-9.]*\)".*/\1/p' | head -n1
}

# ── Actions ────────────────────────────────────────────────────────────────
MERGE_SHA=""

develop_is_on_master() { git merge-base --is-ancestor develop origin/master; }

merge_develop_into_master() {
  info "Checking out master..."
  git checkout --quiet master
  git pull --quiet --ff-only origin master
  info "Merging develop into master..."
  git merge --quiet --no-ff develop -m "chore: merge develop into master for release"
  info "Pushing master..."
  git push --quiet origin master
  MERGE_SHA=$(git rev-parse HEAD)
  git checkout --quiet develop
  # develop is an ancestor of the merge commit, so this is a fast-forward. Doing
  # it now (CI would do it later) lets the next deploy start right away.
  git merge --quiet --ff-only master
  git push --quiet origin develop
}

wait_for_web_release() {
  local timeout="${DEPLOY_WAIT_TIMEOUT_SECONDS:-900}"
  local interval="${DEPLOY_POLL_SECONDS:-10}"
  local deadline=$(( $(date +%s) + timeout ))
  local newest=""
  info "Waiting for the Chrome extension release (the release workflow takes a minute or two)..."
  while :; do
    git fetch --quiet origin --tags
    newest=$(latest_web_tag)
    if [[ -n "$newest" && "$newest" != "$WEB_LAST_TAG" ]]; then break; fi
    if (( $(date +%s) > deadline )); then
      error "No new Chrome extension release appeared within $((timeout / 60)) minutes."
      error "Check the Actions tab. Nothing was done for the VS Code extension;"
      error "once the Chrome release exists, run:  npm run deploy:ide"
      exit 1
    fi
    sleep "$interval"
  done
  info "Chrome extension $newest is released."

  # When the GitHub CLI is available, also wait for the workflow to finish (it
  # uploads the zip after tagging) and stop if it failed.
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    local run_id
    run_id=$(gh run list --workflow release.yml --branch master --limit 10 \
      --json databaseId,headSha --jq ".[] | select(.headSha == \"$MERGE_SHA\") | .databaseId" | head -n1 || true)
    if [[ -n "$run_id" ]]; then
      info "Waiting for the release workflow to finish..."
      if ! gh run watch "$run_id" --exit-status >/dev/null; then
        error "The release workflow failed. The VS Code extension was NOT released."
        error "Fix the Chrome release first, then run:  npm run deploy:ide"
        exit 1
      fi
    fi
  else
    warn "GitHub CLI not available: check in the Actions tab that the Chrome release finished."
  fi
}

release_ide() {
  info "Checking out master and publishing VS Code extension $IDE_VERSION..."
  git checkout --quiet master
  git pull --quiet --ff-only origin master
  bash scripts/release-ide.sh "$IDE_VERSION" --yes
  git checkout --quiet develop
  git pull --quiet --ff-only origin develop || warn "Run 'git pull origin develop' once CI has synced the release back."
}

# ── Plan, confirm once, then act ───────────────────────────────────────────
check_branches
predict_web_release
DO_WEB=0; DO_IDE=0
case "$MODE" in web) DO_WEB=1 ;; ide) DO_IDE=1 ;; both) DO_WEB=1; DO_IDE=1 ;; esac

echo
if [[ "$DO_WEB" == "1" ]]; then
  info "Chrome extension (last release: ${WEB_LAST_TAG:-none})"
  if [[ -n "$WEB_BUMP" ]]; then
    echo "  Will release v$WEB_NEXT_VERSION ($WEB_BUMP), predicted from:"
    printf '%s' "$WEB_COMMIT_LINES"
  else
    echo "  No releasable commits (feat/fix/perf, not (ide)-scoped): the merge to"
    echo "  master will NOT publish a new Chrome extension version."
  fi
fi

if [[ "$DO_IDE" == "1" ]]; then
  if [[ "$MODE" == "ide" && -n "$WEB_BUMP" ]]; then
    error "These Chrome extension changes would be released by the merge to master:"
    printf '%s' "$WEB_COMMIT_LINES" >&2
    error "Deploying only the VS Code extension would release them as a side effect."
    error "Run  npm run deploy:both  (Chrome first, then VS Code), or  npm run deploy:web  first."
    exit 1
  fi
  plan_ide_release
  MIN_CHROME=$(ide_min_chrome_version)
  LATEST_WEB="${WEB_LAST_TAG#v}"
  PROVIDED_WEB="$LATEST_WEB"
  [[ -n "$WEB_NEXT_VERSION" ]] && PROVIDED_WEB="$WEB_NEXT_VERSION"
  if [[ -z "$PROVIDED_WEB" ]] || version_lt "$PROVIDED_WEB" "$MIN_CHROME"; then
    error "The VS Code extension needs Chrome extension v$MIN_CHROME or newer, but the newest"
    error "(or about-to-be-released) Chrome extension is v${PROVIDED_WEB:-none}."
    error "Release the Chrome extension first — a feat:/fix: web commit, then: npm run deploy:both"
    exit 1
  fi
  echo
  info "VS Code extension (last release: ${IDE_LAST_TAG:-none})"
  echo "  Will release ide-v$IDE_VERSION, which needs Chrome extension v$MIN_CHROME or newer. Changes:"
  echo "$IDE_COMMIT_LINES"
fi

echo
if develop_is_on_master; then
  info "master already contains develop: nothing to merge."
  NEEDS_MERGE=0
else
  NEEDS_MERGE=1
  info "Will merge 'develop' into 'master' and push (this triggers the release workflow)."
fi
[[ "$MODE" == "both" || "$MODE" == "ide" ]] && [[ "$DO_IDE" == "1" ]] && info "Then it will tag ide-v$IDE_VERSION, which publishes the VS Code extension."
echo

if [[ "$DO_WEB" == "1" ]]; then
  info "Running lint and build..."
  npm --prefix web run lint
  npm --prefix web run build
fi
if [[ "$DO_IDE" == "1" ]]; then
  info "Type-checking the VS Code extension..."
  npm --prefix ide run typecheck
fi

if [[ "$DO_WEB" == "1" && -z "$WEB_BUMP" ]]; then
  warn "Nothing releasable for the Chrome extension."
fi
if ! confirm "Continue?"; then
  info "Aborted. No changes made."
  exit 1
fi

if [[ "$NEEDS_MERGE" == "1" ]]; then
  merge_develop_into_master
else
  MERGE_SHA=$(git rev-parse origin/master)
fi

if [[ "$DO_WEB" == "1" && -n "$WEB_BUMP" && "$DO_IDE" == "1" ]]; then
  wait_for_web_release
fi
if [[ "$DO_IDE" == "1" ]]; then
  release_ide
fi

echo
info "Done."
if [[ "$DO_WEB" == "1" && "$DO_IDE" == "0" ]]; then
  info "Check the Actions tab for release progress. CI pushes a version-bump commit and"
  info "merges it back into develop when done — run 'git pull origin develop' after."
fi
