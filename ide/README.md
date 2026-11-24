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
| WebSocket server + mutual-auth handshake, real data from Chrome | done |
| Reset Pairing, port-in-use handling | done |
| Copy previous week | not built (the web UI has it) |

## Use it with your real hours

1. Build and (re)load the Chrome extension: `npm --prefix web run build`, then
   refresh it in `chrome://extensions`. Open your NetSuite time entry page once
   so the extension learns your account.
2. Press **F5** at the repo root and pick **"IDE extension"** (not the mock one).
3. In the sidebar click **Pair with Chrome** — a pairing code is copied.
4. Click the Chrome extension's toolbar icon, paste the code into its **VS Code**
   section and press **Pair**. The sidebar fills with your week.

Chrome must be running and logged in to NetSuite, but no NetSuite tab needs to be
open. Only one browser can be connected at a time. **Reset Pairing…** (the `…`
menu in the view title) throws the token away.

### Security model (server side)

Anything on the machine can try to connect to the port, so the server never
trusts a client until it has proved it knows the pairing token (an HMAC
handshake; the token is never sent). It also listens on 127.0.0.1 only, refuses
browser origins that aren't an extension, and has handshake/idle timeouts, a
payload cap and a cap on unauthenticated sockets. Don't weaken these without
re-running the attack cases (see `src/bridge/server.ts`).

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
  bridge/server.ts        the WebSocket server and handshake (no `vscode` import)
  data/bridgeRepository.ts  the real data source: asks Chrome over the bridge (no `vscode` import)
  data/mockWeekRepository.ts  fake data for UI work
  data/weekRepository.ts  the interface both implement
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
