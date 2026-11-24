# AGENTS.md — NetSuite Fast Time Tracker

Guidance for AI agents working on this codebase.

## Repository layout

The repo is split in two. **Everything described in this file lives in `web/`** (the Chrome extension) — paths like `src/services/` mean `web/src/services/`, and all npm commands run from `web/`. `ide/` is the VS Code extension (its own `package.json`; see `ide/README.md` — it follows the same conventions: long names, no `any`, no `!`, `forEach` over `reduce`). `protocol/` holds the wire protocol both extensions speak (see "VS Code bridge" below). Repo-level files (`.github/`, `.husky/`, `scripts/`, `.nvmrc`) stay at the root.

## Verification commands

Always run these from `web/` after making changes:

```bash
# Type-check the entire project (zero errors expected)
npx tsc --noEmit

# Lint
npm run lint

# Format check
npm run format:check

# Full build (outputs to dist/)
npm run build
```

There are no automated tests. Verification is type-checking + lint + build.

## Path aliases

`@/` maps to `src/`. Always use it for imports that cross directory boundaries — avoid long relative paths like `../../../`.

```ts
import type { WeekData } from "@/utils/types";
import { CacheService } from "@/services/cache.service";
```

## Code conventions

- **Long variable names** are preferred over abbreviations. `displayedWeekData` over `d`, `mondayISO` over `mon`.
- **No `any`** — use `unknown` when the shape is genuinely unknown, or model the type properly.
- **No non-null assertions (`!`)** — use optional chaining or explicit guards.
- **Functional array methods** (`map`, `filter`, `forEach`) over `for` loops where it reads more clearly. `reduce` is avoided — use `forEach` with mutation instead.

## Architecture rules

### Services (`src/services/`)
Own all I/O — HTTP calls, chrome storage, localStorage, and domain operations that coordinate between multiple API calls. Services are plain async functions, no React.

- `connection.service.ts` — the NetSuite account in use (`origin` + handler URL). Window-free: the page sets it synchronously from its URL (via `readConnectionFromPage()` in `utils/pageConnection.ts`, content-script only), other contexts load the persisted copy from `chrome.storage`.
- `apiClient.service.ts` — shared axios instance with no module-level URL; `resolveHandlerRequest(query)` resolves the endpoint per request. A response interceptor throws `SessionExpiredError` when NS answers with its login page (HTTP 200 + `text/html`, so the status code can't be trusted).
- `bridgeSettings.service.ts` — persists the VS Code pairing settings (`bridge_settings`) and the live connection state (`bridge_status`) in `chrome.storage.local`, so the popup can show what the service worker is doing.
- `fetch.service.ts` / `save.service.ts` / `delete.service.ts` — raw HTTP transport
- `week.service.ts` — fetches 3 parallel NS week windows and merges them
- `row.service.ts` — builds save/delete payloads and calls the transport layer
- `cache.service.ts` — chrome.storage reads/writes + fetch-and-cache strategy
- `chromeStorage.service.ts` — Promise wrappers for `chrome.storage.local`
- `session.service.ts` — persists `userId` and `defaultItemId` in `localStorage` (use `window.localStorage`, not bare `localStorage`)
- `theme.service.ts` — persists the light/dark preference in `localStorage` (`ft_theme`) and applies it via `data-ft-theme` on `<html>`. Falls back to `prefers-color-scheme`.
- `target.service.ts` — persists the weekly hours target in `localStorage` (`ft_weekly_target`, default 40). Pure target maths (daily share, under/over status) lives in `src/utils/target.ts`.
- `reminder.service.ts` — persists the opt-in reminder settings and the hours snapshot in `chrome.storage.local` (not `localStorage`, because the background service worker can't read the page's). Pure logic (next fire time, notification text) lives in `src/utils/reminder.ts`.
- `version.service.ts` — calls `api.github.com` to check for a newer release; returns `VersionCheckResult | null`. Safe to call from a content script — the GitHub API sends CORS headers. Failures are silent (returns `null`).

### State (`src/context/useStore.ts`)
Three grouped `useState` calls — `week`, `catalog`, and `statuses`. Session data is intentionally **not** in React state — it lives in `localStorage` via `SessionService`.

- `week` — `{ weekISO, weekData, refreshing, initialized }`
- `catalog` — `{ projects, tasks }`
- `statuses` — map of active status messages

Update grouped state with spread: `setWeek(prev => ({ ...prev, weekData: fresh }))`. Do not add individual flat state fields — group them into the appropriate domain object.

### Context (`src/context/AppContext.tsx`)
`AppStore` exposes `week`, `catalog`, `statuses`, status helpers, and the four page-level actions (`navigate`, `onSave`, `onDelete`, `onAddRow`). Components read from context via `useStore()`.

### Hooks (`src/hooks/`)
- `useWeekCache` — cache-first loading strategy, stale-request guard via `activeWeekRef`. Reads session from `SessionService.get()`.
- `useRowMutations` — save debounce, row gate, optimistic delete. Reads session from `SessionService.get()`.

- `useWeeklyTarget` — weekly target state wrapper around `TargetService`; called once in `HomePage` and passed as props to `WeekProgress` and `WeekGrid` so both stay in sync.
- `useHoursSnapshot` — called once in `HomePage`; writes the current week's logged hours + target to `chrome.storage.local` so `background.ts` can build the reminder without calling NetSuite. Only the current week is recorded.
- `useReminderSettings` — load/save wrapper around `ReminderService` settings; used by `ReminderBell`.
- `useBridgePairing` — pairing settings + live connection state for the popup's `BridgePairing` (listens to `chrome.storage.onChanged`).
- `useTheme` — light/dark state wrapper around `ThemeService`; used by `Footer` for the theme toggle.

### Theming (`src/styles/`)
Colour tokens in `_variables.scss` are `var(--ft-*)` references, **not** literal values — never use `darken()`, `rgba($token, …)` or other SCSS colour functions on them. Add a new colour by defining it in both palettes in `theme.scss` and exposing a SCSS token in `_variables.scss`. Don't hardcode hex colours in component styles.

### Pages (`src/pages/`)
- `HomePage.tsx` — calls `useStore()` and `useHomePageData()`, provides context, renders layout
- `useHomePage.data.ts` — orchestration: init fetch, navigation logic, wires `useWeekCache`
- `useStore.ts` is in `src/context/` not `src/pages/`

### Components (`src/components/`)
- `atoms/` — small, no direct API calls or store mutations
- `blocks/` — larger UI blocks; may read from `useStore()` but do not own state
- `Footer` — calls `VersionService.check()` on mount; if `hasUpdate` is true, renders an update banner above the footer text. Also hosts the light/dark toggle (via `useTheme`). Self-contained — no store state involved.

### Background service worker (`src/background.ts`)
Fires the opt-in hours reminder via `chrome.alarms` + `chrome.notifications`, and starts the VS Code bridge (`initBridge()`). It has no `window`, so everything it imports — transitively — must be window-free: `@/utils/days`, `@/utils/dates`, `@/utils/reminder`, `@/utils/rows`, `@/utils/guards`, `@/services/*` (including the HTTP services, which resolve their URL per request through `ConnectionService`) and `@/bridge/*`. Never import `utils/pageConnection.ts`, `SessionService`, `ThemeService`, `TargetService` or anything under `components/`, `hooks/`, `context/` or `pages/`. Register listeners synchronously at the top level — the worker is restarted by events.

### VS Code bridge (`src/bridge/`, `/protocol`)
Lets the planned VS Code extension (`ide/`) read and write hours through the browser's NetSuite session — no credentials ever leave Chrome.

- `/protocol/protocol.ts` is the single source of truth for the wire format. It must stay dependency-free (no imports, no `window`/`chrome`/`vscode`), and is imported via the `@protocol` alias. It is compiled into each package separately; neither package ships the other. Changing a message shape means bumping `PROTOCOL_VERSION`.
- `bridge/bridge.service.ts` owns the WebSocket. Chrome connects **out** to `ws://127.0.0.1:<port>` (a browser can't be dialed into) and keeps the worker alive with a 20s `keepalive`. A 30s `chrome.alarms` alarm reconnects after Chrome terminates the worker.
- **Security model — never weaken this.** Any local program can listen on that port, so Chrome must not trust the server by default. The pairing token is never sent; both sides prove they know it with an HMAC handshake (`hello` → `challenge` → `auth` → `welcome`, see `protocol.ts`). Chrome verifies the server's proof *before* sending its own, and acts on no request until the stage is `ready`. Close codes 4001/4002 are only believed from a server that has proved itself (otherwise an impostor could disable the bridge by hanging up with them). A failed server proof sets state `untrusted` and retries only via the 30s alarm; a verified server's rejection is not retried until the user re-pairs. Any change to this flow needs the impostor cases (a server without the token must be unable to read data, change data, learn the token, or disable the bridge) re-verified. `connect()` is serialised through `requestConnect()` — always go through it, never call `connect()` directly.
- `bridge/handlers.ts` maps requests onto the existing services (`loadWeek`, `RowService`, …). Keep NetSuite knowledge (date shift, merging, row collapsing) in those services, not here. It applies the same locking rules as the page (approved/submitted/disabled cells are read-only; rows with approved entries can't be deleted), reuses an existing `timeid` so saves update instead of duplicating, refreshes the page cache after every read/write, and maps failures to `BridgeErrorCode`s. Request params are untrusted JSON — validate every field.
- The other end of this socket is `ide/src/bridge/server.ts` (see `ide/README.md`). Both ends keep the same rule: nothing is trusted until the HMAC handshake completes. The server admits one browser at a time (a second one is closed with `CLOSE_CODE_BUSY` and just retries).
- Pairing: the VS Code extension generates a token and a pairing code (`nsft1.<port>.<token>`); the user pastes it into the popup (`popup/BridgePairing.tsx`).

### Mocks (`src/mocks/`)
Development stubs for visual testing. Never imported in production code paths.

- `version.ts` — exports `MOCK_VERSION_CHECK: VersionCheckResult` for stubbing the Footer update banner during development

## NetSuite API specifics

### The timezone shift
The NS server runs on US/Pacific time. The extension is used from Buenos Aires (UTC-3), creating a +1 day offset. API dates are 1 day behind the real date they represent. The `DATE_SHIFT = 1` constant in `week.service.ts` handles this — do not remove it.

### The three-fetch pattern
`week.service.ts` makes three parallel fetches per week load because NS uses Sun–Sat weeks internally:
- **Primary** (`shift`): covers Mon–Thu of the displayed week
- **Overlap** (`shift - 1`): covers Fri–Sat which fall in NS's next Sun–Sat window
- **Next week** (`shift`): catches entries for future days of the week

All three responses are merged before returning `WeekData`.

### Handler URL
The NS data handler URL is dynamic — the account ID is part of the hostname. `readConnectionFromPage()` builds it from `window.location` (and the inner iframe's script ID) and hands it to `ConnectionService`; `resolveHandlerRequest()` in `apiClient.service.ts` reads it back and extracts the `script` and `deploy` params. Nothing outside `utils/pageConnection.ts` and `index.tsx` should touch `window.location` for this.

## Releases and commit scopes

- The Chrome extension is released by semantic-release from `master` (tags `vX.Y.Z`); the VS Code extension is released separately by pushing `ide-vX.Y.Z` (see the root README). They share one repository, so:
- **A commit that only touches `ide/` must use the `(ide)` scope** (`feat(ide): …`). `web/.releaserc.json` ignores `(ide)` commits; an unscoped `feat:`/`fix:` triggers a Chrome release even if it only changed `ide/`.
- **Never let a VS Code release become the repository's "latest" release.** Installed Chrome extensions read `releases/latest` (old versions) or the newest `vX.Y.Z` release (`VersionService`, new versions). `.github/workflows/ide-release.yml` publishes with `--latest=false` and `scripts/ensure-web-latest.sh` verifies it.
- `VersionService` picks the newest `vX.Y.Z` release from the release list, ignoring `ide-v*`, drafts and prereleases.
- Chrome ships first: `MIN_CHROME_EXTENSION_VERSION` (`ide/src/constants.ts`) must always be a released Chrome version before a VS Code release is cut (`scripts/check-ide-release.sh` enforces it).

## Manifest and versioning

The extension manifest is generated at build time in `vite.config.ts`. The `version` field is read from `package.json` — never hardcode it in `vite.config.ts`. When `semantic-release` bumps `package.json`, the next build automatically picks up the new version.

`host_permissions` in `vite.config.ts` includes `https://api.github.com/*` to allow `VersionService` to call the GitHub REST API from the content script context.

## Adding a new feature

1. If it requires an API call, add it to the appropriate service in `src/services/`
2. If it requires new persistent data (like session info), use `localStorage` via a service — don't add it to `useStore`
3. If it requires new reactive state, add a field to the appropriate group in `useStore.ts` (`week`, `catalog`, or `statuses`)
4. If it's page-level logic (effects, derived actions), add it to `useHomePage.data.ts`
5. If it's a UI element, add a component under `src/components/atoms/` or `src/components/blocks/`
6. Expose any new store fields or actions through `AppStore` in `AppContext.tsx` if components need them
7. Run `npx tsc --noEmit` and `npm run lint` before finishing
