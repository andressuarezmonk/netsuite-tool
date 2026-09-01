# AGENTS.md — NetSuite Fast Time Tracker

Guidance for AI agents working on this codebase.

## Verification commands

Always run these after making changes:

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

- `fetch.service.ts` / `save.service.ts` / `delete.service.ts` — raw HTTP transport
- `week.service.ts` — fetches 3 parallel NS week windows and merges them
- `row.service.ts` — builds save/delete payloads and calls the transport layer
- `cache.service.ts` — chrome.storage reads/writes + fetch-and-cache strategy
- `chromeStorage.service.ts` — Promise wrappers for `chrome.storage.local`
- `session.service.ts` — persists `userId` and `defaultItemId` in `localStorage` (use `window.localStorage`, not bare `localStorage`)
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

### Pages (`src/pages/`)
- `HomePage.tsx` — calls `useStore()` and `useHomePageData()`, provides context, renders layout
- `useHomePage.data.ts` — orchestration: init fetch, navigation logic, wires `useWeekCache`
- `useStore.ts` is in `src/context/` not `src/pages/`

### Components (`src/components/`)
- `atoms/` — small, no direct API calls or store mutations
- `blocks/` — larger UI blocks; may read from `useStore()` but do not own state
- `Footer` — calls `VersionService.check()` on mount; if `hasUpdate` is true, renders an update banner above the footer text. Self-contained — no store state involved.

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
The NS data handler URL is dynamic — built at runtime from `window.location` since the account ID is part of the hostname. `getHandlerParams()` in `apiClient.service.ts` extracts `script` and `deploy` query params from the current handler URL.

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
