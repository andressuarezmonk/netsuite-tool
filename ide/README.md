# NetSuite Fast Time Tracker — VS Code extension

See and log your NetSuite hours from the VS Code activity bar.

NetSuite's session lives in the browser, so this extension never talks to
NetSuite itself: it talks to the Chrome extension in [`../web`](../web) over a
localhost WebSocket (see [`../protocol`](../protocol)).

## Status

| Piece | State |
|---|---|
| Week calendar in the activity bar (grid of tasks × days, inline editing, totals, weekly target progress, week navigation, add/delete row) | done |
| "Open Week in Editor" — the same grid as a wide editor tab | done |
| Log hours quick-pick flow, status bar item | done |
| "Pair with Chrome" command (generates the pairing code) | done |
| WebSocket server + handshake (the real data source) | **not built yet** |
| Copy previous week | not built (the web UI has it) |

Until the server exists, the extension shows "Waiting for Chrome…" outside mock mode.

## Develop

```bash
cd ide
npm install
npm run build        # one-off bundle to dist/
npm run watch        # rebuild on save
npm run typecheck
npm run format:check
```

Press **F5** at the repo root and pick a launch configuration:

- **IDE extension (mock data)** — fake week data and no Chrome needed. Use this
  for UI work. Started with `NETSUITE_TRACKER_MOCK=1`.
- **IDE extension** — the real wiring (shows the pairing / waiting states).

## Layout

```
src/
  extension.ts            activation and wiring
  model/weekModel.ts      pure logic: hours parsing/formatting, day summaries (status bar)
  model/weekViewModel.ts  pure: the JSON the grid renders (rows, cells, day columns, progress)
  state/weekStore.ts      current week, view state, navigation, serialised saves/deletes
  data/                   WeekRepository interface + mock and disconnected implementations
  views/weekWebview.ts    hosts the grid (sidebar + editor tab), validates webview messages
  views/statusBar.ts      today/week hours in the status bar
  webview/main.ts         the grid itself — runs inside the webview (browser code)
  webview/messages.ts     message types shared by the host and the webview
  commands/               commands and the quick-pick flow
  pairing.ts              pairing token (SecretStorage) and code
media/week.css            grid styles, driven by VS Code theme variables
```

The grid is a webview (`dist/webview.js` + `media/week.css`), built as a second
esbuild bundle. The extension host owns all data and side effects; the webview
only draws the view model it is sent and reports what the user does. It layouts
by the width of the view, not the window: narrow (sidebar) rows are two lines
(name/total, then seven day cells), wide ones match the web UI's single-line rows.

The webview runs under a strict CSP — no inline scripts or styles. Anything that
needs a dynamic style must be set through the CSSOM from script.

`extensionKind` is `ui` on purpose — the
extension must run on the same machine as Chrome, even in remote windows.
