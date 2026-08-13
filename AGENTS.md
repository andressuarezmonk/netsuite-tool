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
Own all I/O — HTTP calls, chrome storage, and domain operations that coordinate between multiple API calls. Services are plain async functions, no React.

- `fetch.service.ts` / `save.service.ts` / `delete.service.ts` — raw HTTP transport
- `week.service.ts` — fetches 3 parallel NS week windows and merges them
- `row.service.ts` — builds save/delete payloads and calls the transport layer
- `cache.service.ts` — chrome.storage reads/writes + fetch-and-cache strategy
- `chromeStorage.service.ts` — Promise wrappers for `chrome.storage.local`

### State (`src/context/useStore.ts`)
Only state that needs to be global in order to be shared by multiple components is stored here.

### Context (`src/context/AppContext.tsx`)
`AppStore` extends `Store` with the two page-level actions (`navigate`, `onAddRow`) that come from `useHomePageData`. Components read from context via `useStore()`.

### Hooks (`src/hooks/`)
- `useWeekCache` — cache-first loading strategy, stale-request guard via `activeWeekRef`
- `useRowMutations` — save debounce, row gate, optimistic delete

### Pages (`src/pages/`)
- `HomePage.tsx` — calls `useStore()` and `useHomePageData()`, provides context, renders layout
- `useHomePage.data.ts` — orchestration: init fetch, navigation logic, wires `useWeekCache`
- `useStore.ts` is in `src/context/` not `src/pages/`

### Components (`src/components/`)
- `atoms/` — small, no direct API calls or store mutations
- `blocks/` — larger UI blocks; may read from `useStore()` but do not own state

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

## Adding a new feature

1. If it requires an API call, add it to the appropriate service in `src/services/`
2. If it requires new state, add it to `useStore.ts`
3. If it's page-level logic (effects, derived actions), add it to `useHomePage.data.ts`
4. If it's a UI element, add a component under `src/components/atoms/` or `src/components/blocks/`
5. Expose any new store fields or actions through `AppStore` in `AppContext.tsx` if components need them
6. Run `npx tsc --noEmit` and `npm run lint` before finishing
