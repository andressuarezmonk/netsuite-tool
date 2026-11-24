# NetSuite Fast Time Tracker — VS Code extension

See and log your NetSuite hours from the VS Code activity bar.

NetSuite's session lives in the browser, so this extension never talks to
NetSuite itself: it talks to the Chrome extension in [`../web`](../web) over a
localhost WebSocket (see [`../protocol`](../protocol)).

## Status

| Piece | State |
|---|---|
| Activity bar week view (days, entries, weekly target progress, week navigation) | done |
| Log / edit hours (quick pick + input boxes) | done |
| Status bar item (today's hours, week progress) | done |
| "Pair with Chrome" command (generates the pairing code) | done |
| WebSocket server + handshake (the real data source) | **not built yet** |

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
  extension.ts          activation and wiring
  model/weekModel.ts    pure logic: day summaries, target progress, hours parsing
  state/weekStore.ts    current week, view state, navigation, saving
  data/                 WeekRepository interface + mock and disconnected implementations
  views/                tree provider (the week view) and status bar item
  commands/             commands and the quick-pick flows
  pairing.ts            pairing token (SecretStorage) and code
```

The week view is a native `TreeView`, not a webview: it is themed, keyboard
accessible and cheap to maintain. `extensionKind` is `ui` on purpose — the
extension must run on the same machine as Chrome, even in remote windows.
