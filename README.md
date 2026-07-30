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

## Project structure

```
src/
  lib/
    api.ts         # All NetSuite API calls (loadInit, loadWeek, saveRow)
    dates.ts       # Date helpers + timezone shift detection
    types.ts       # TypeScript interfaces
    constants.ts   # HANDLER URL, DAYS array, etc.
  content/
    index.tsx      # Extension entry — mounts React into Shadow DOM
    App.tsx        # Root component + state management
    App.css        # All styles (scoped via Shadow DOM)
    components/
      WeekGrid.tsx  # Weekly table with editable cells
      WeekNav.tsx   # Prev/next/today navigation
      AddRowBar.tsx # Add a new project/task row
      StatusBar.tsx # Loading/success/error feedback
  popup/
    popup.html     # Extension toolbar popup shell
    index.tsx      # Popup entry point
    PopupApp.tsx   # Popup UI
  background.ts    # Service worker stub
dist/              # Built output — load this folder as the extension
icons/             # Extension icons
```

## How it works

- Intercepts `script=2375` (the slow time entry scriptlet) and replaces the page with a React app
- Fetches data from `script=2373` (the real NS data handler) using your existing browser session
- Auto-detects your timezone offset vs the NS server to correctly map API dates to display dates
- Saves via `saveBlock` GET requests, same as the original NS UI
