# NetSuite Fast Time Tracker

A Chrome extension that replaces the slow NetSuite Weekly Time Entry page with a fast React UI.

## Installation

1. Go to the [Releases](../../releases) page and download the `dist.zip` from the latest release
2. Extract the zip — you'll get a `dist/` folder
3. Open your Chromium-based browser (Chrome, Edge, Brave, etc.) and navigate to the extensions page:
   - Chrome / Brave: `chrome://extensions`
   - Edge: `edge://extensions`
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked** and select the extracted `dist/` folder
6. The extension is now active — navigate to your NetSuite Weekly Time Entry page to use it

## Updating

The extension checks for updates automatically on each page load. When a new version is available, a banner appears in the footer:

> ↑ v1.x.x available — download

Click **download** to go to the releases page, grab the new `dist.zip`, extract it, and reload the extension in `chrome://extensions` using the refresh icon. The whole process takes about 30 seconds.

## Repository layout

| Folder | What it is |
|---|---|
| [`web/`](web) | The Chrome extension (React + Vite). All build, lint and release tooling lives here. |
| [`ide/`](ide) | The VS Code extension: activity bar week view, log/edit hours. The real data link to Chrome is not built yet. |
| [`protocol/`](protocol) | The wire protocol shared by both extensions. |
| `scripts/` | Repo-level scripts (`deploy.sh`). |

The commands below are run from `web/`.

## Setup (for development)

```bash
cd web
npm install
```

## Development

```bash
npm run dev   # watch mode — rebuilds on every save
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the **`dist/`** folder
4. After any code change, click the refresh icon on the extension

## Build

```bash
npm run build
```

## How it works

- Intercepts `script=2375` (the slow time entry scriptlet) and replaces the page with a React app
- Fetches data from `script=2373` (the real NS data handler) using your existing browser session
- Auto-detects the timezone offset between the NS server (US/Pacific) and local time to correctly map API dates to display dates
- Saves via `saveAll` POST requests, same as the original NS UI
- Caches week data in `chrome.storage.local` for instant loading on repeat visits (7-day TTL)

## Project structure

Paths below are relative to `web/`.

```
src/
  index.tsx           # Extension entry — mounts React into the intercepted page
  App.tsx             # Root component — renders HomePage inside the store provider
  background.ts       # Service worker stub (unused, reserved for future use)

  pages/
    HomePage.tsx            # Page shell — provides app context, renders layout
    useHomePage.data.ts     # Orchestration hook — init fetch, navigation, row add
    useStore.ts             # (via context/) All app state — week data, NS data, statuses

  context/
    AppContext.tsx     # React context definition + useStore() consumer hook
    useStore.ts        # All useState/useRef — the single source of truth for app state

  hooks/
    useWeekCache.ts    # Cache-first week loading with stale-request guard
    useRowMutations.ts # Save and delete logic with debounce and optimistic UI

  services/
    apiClient.service.ts      # Axios instance + getHandlerParams()
    fetch.service.ts          # GET requests to the NS handler (init, week data)
    save.service.ts           # POST saveAll request
    delete.service.ts         # GET deleteRecords request
    row.service.ts            # saveRow + deleteRow domain logic (builds payloads)
    week.service.ts           # loadWeek — fetches 3 parallel windows, merges results
    cache.service.ts          # chrome.storage cache: get, set, evict, fetch-and-cache
    chromeStorage.service.ts  # Promise wrappers for chrome.storage.local
    session.service.ts        # NS session data (userId, defaultItemId) via localStorage
    version.service.ts        # Checks GitHub API for a newer release; used by Footer

  components/
    atoms/
      StatusBar/   # Loading/success/error status strip
      WeekNav/     # Prev/next/today/week-picker navigation
    blocks/
      Header/      # Page header with title and bypass link
      Footer/      # Page footer — also shows update-available banner when a new version is detected
      WeekGrid/    # Weekly table — renders rows and day column headers
      TimeRow/     # Single project/task row with delete button
      DayCell/     # Individual hour input cell
      DayTotals/   # Column totals footer row
      AddRowBar/   # Project + task selectors for adding a new row

  constants/
    nsEnums.ts     # NetSuite API enum values (approval status, etc.)
    statusId.ts    # Status channel identifiers
    statusKind.ts  # Status display kinds (fetch, mutation, error, etc.)

  utils/
    constants.ts        # NS handler URL, DAYS array, script ID helpers
    dates.ts            # Date formatting, ISO helpers, timezone shift logic
    types.ts            # TypeScript interfaces (WeekData, TimeRow, DayEntry, etc.)
    merge.ts            # Merges fresh server data with locally-edited displayed data
    debouncedAsync.ts   # Keyed async debounce utility
    keyedDebounce.ts    # Keyed synchronous debounce utility

  styles/
    _variables.scss  # Shared SCSS variables (colours, spacing, transitions)

  popup/
    popup.html     # Extension toolbar popup shell
    index.tsx      # Popup entry point
    PopupApp.tsx   # Popup UI
```

## Release pipeline

The workflow runs inside `web/` (`working-directory: web`), so `package.json`, `.releaserc.json` and `dist.zip` all live there.

Pushing a `feat:` or `fix:` commit to `main`/`master` triggers the GitHub Actions release workflow:

1. `semantic-release` analyzes commit messages, bumps `package.json`, tags the release, and creates a GitHub Release
2. The build runs after the version bump so `dist/manifest.json` picks up the new version
3. `dist.zip` is uploaded to the release as the installable artifact

The extension manifest version is read directly from `package.json` at build time (`vite.config.ts`), so it always matches the release tag.

The extension checks `api.github.com` for a newer `tag_name` on each page load and shows a footer banner when one is found.

### Merging `develop` into `master`

Day-to-day work happens on `develop`; `master` only moves forward when it's time to cut a release. Merge with a **squash merge**, not a regular merge — the individual commits on `develop` don't need to survive on `master`.

The important part: `semantic-release`'s commit analyzer only sees whatever commit(s) land on `master`. A squash merge collapses everything from `develop` into **one** commit, so that commit's header is the *only* thing that decides the release type — the original `feat:`/`fix:`/`task:`/`refac:` commits on `develop` are irrelevant once squashed. Pick the header deliberately:

- `feat: ...` → minor bump (use this if any feature shipped in the batch)
- `fix: ...` → patch bump
- a `BREAKING CHANGE:` footer → major bump, regardless of type
- anything else (`chore:`, `refactor:`, `docs:`, `task:`, `style:`, `test:`, `build:`, `ci:`) → **no release at all**

```bash
git fetch origin
git checkout master
git pull origin master

# Stage develop's changes as one squashed changeset (does not commit)
git merge --squash develop

# The header here is what semantic-release reads — choose the type that
# reflects the highest-impact change in the batch
git commit -m "feat: <summary of what shipped>"

git push origin master
```

Pushing to `master` triggers the release workflow described above, which also merges `master` back into `develop` automatically so version bump commits don't get lost. Pull `develop` again afterward to pick that up locally:

```bash
git checkout develop
git pull origin develop
```

## VS Code extension releases

The VS Code extension ([`ide/`](ide)) is released **independently** of the Chrome extension, from the same repository:

| | Chrome extension | VS Code extension |
|---|---|---|
| Tag | `vX.Y.Z` | `ide-vX.Y.Z` |
| Triggered by | merging to `master` (semantic-release, see above) | pushing the tag — `npm run release:ide -- X.Y.Z` from `ide/` |
| Artifact | `dist.zip` | `.vsix` |
| Marked "latest"? | yes | **never** (`--latest=false`) |

Why "never latest": every installed Chrome extension reads the repository's `releases/latest` to show its update banner, so that must always be a Chrome release. The VS Code release workflow marks its release as not-latest and then verifies (and repairs) that invariant.

**Commit scopes decide which release a commit can trigger.** A change that only touches the VS Code extension must be committed with the `(ide)` scope (`feat(ide): …`, `fix(ide): …`); the Chrome release config ignores those. An unscoped `feat:`/`fix:` always releases the Chrome extension.

**Order: Chrome first, always.** The VS Code extension declares the oldest Chrome extension it works with (`MIN_CHROME_EXTENSION_VERSION` in `ide/src/constants.ts`). `scripts/release-ide.sh` and the release workflow both refuse to publish a VS Code release until a Chrome release at least that new exists, and at runtime the extension turns away older Chrome extensions with an explanation. Raise the constant whenever the VS Code extension starts needing something newer in Chrome — and for a breaking protocol change, release Chrome first.

Users find the VS Code extension through a link in the Chrome extension's popup, so they only see it once they have a bridge-capable Chrome extension.

## Architecture

State is managed with three grouped `useState` calls in `useStore` — `week`, `catalog`, and `statuses` — exposed through a single React context (`AppContext`). Components read from the store via `useStore()`.

Session data (`userId`, `defaultItemId`) is not kept in React state. It's written to `localStorage` once on init by `SessionService` and read synchronously from there by any hook that needs it.

The data flow for a week load is:
1. `useHomePage.data.ts` calls `loadWeekWithCache` on init and navigation
2. `useWeekCache` checks `chrome.storage` for a cached entry, shows it immediately if present, then fetches fresh data from the NS API via `CacheService.fetchAndCacheWeek`
3. `week.service.ts` makes three parallel fetches (primary window, overlap, next week) to work around the NS Sun–Sat week boundary, then merges the results into a single `WeekData`
4. Fresh data is merged with any unsaved local edits via `merge.ts` before being written to state
