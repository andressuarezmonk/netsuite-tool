# NetSuite Fast Time Tracker

A Chrome extension that replaces the slow NetSuite Weekly Time Entry page with a fast React UI.

## Setup

```bash
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

  components/
    atoms/
      StatusBar/   # Loading/success/error status strip
      WeekNav/     # Prev/next/today/week-picker navigation
    blocks/
      Header/      # Page header with title and bypass link
      Footer/      # Page footer
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

## Architecture

State is managed with plain `useState` hooks in `useStore`, exposed through a single React context (`AppContext`). Components read from the store via `useStore()`.

The data flow for a week load is:
1. `useHomePage.data.ts` calls `loadWeekWithCache` on init and navigation
2. `useWeekCache` checks `chrome.storage` for a cached entry, shows it immediately if present, then fetches fresh data from the NS API via `CacheService.fetchAndCacheWeek`
3. `week.service.ts` makes three parallel fetches (primary window, overlap, next week) to work around the NS Sun–Sat week boundary, then merges the results into a single `WeekData`
4. Fresh data is merged with any unsaved local edits via `merge.ts` before being written to state
