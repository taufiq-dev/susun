# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trowel is a desktop database GUI (SQL editor, table browser, JSON row viewer) built with Electron, React 19, TypeScript and Vite via electron-vite. It is a from-scratch rewrite inspired by Beekeeper Studio. The main-process side (database clients, saved connections, the `window.api` IPC), the app shell (connect screen, workspace layout, tabs in split panes) and the query tab exist; the table grid and JSON viewer don't yet.

Build progress, the remaining steps and open decisions are tracked in `PLAN.md`. Read it at the start of a session and tick its checkboxes as steps land. The repo is a git repository on `main`: commit each step as it lands.

## Commands

Package manager is pnpm 11.

```bash
pnpm dev                 # electron-vite dev server + app; renderer has HMR
pnpm dev --watch         # also rebuild/restart on main or preload changes (otherwise restart manually)
pnpm lint                # ESLint (flat config, cached in .eslintcache)
pnpm test                # Vitest, once (pnpm test:watch to re-run on change); tests are src/**/*.test.ts
pnpm typecheck           # tsc on both TS projects; typecheck:node or typecheck:web for one side
pnpm format              # Prettier --write
pnpm build               # typecheck, then electron-vite build into out/
pnpm start               # run the built app from out/
pnpm build:mac           # package with electron-builder into dist/ (also build:win, build:linux, build:unpack)
```

`build:mac` and `build:linux` skip the typecheck (they call `electron-vite build` directly); `build:win` and `build:unpack` go through `pnpm build`. Vitest (`vitest.config.ts`, which repeats the `@shared` alias) covers pure code such as the SQL splitter; the database clients and UI are tested by driving the built app (below).

To run the built app without touching the real userData folder or the login keychain (e.g. when testing saved connections), use `node_modules/.bin/electron . --user-data-dir=<scratch dir> --use-mock-keychain`; add `--remote-debugging-port=9333` to drive `window.api` over the DevTools protocol.

VS Code: the "Debug All" launch config debugs main and renderer together (renderer attaches on port 9222).

## Architecture

electron-vite builds three targets from `electron.vite.config.ts`, output to `out/main`, `out/preload`, `out/renderer`:

- `src/main/` — Electron main process (Node). `index.ts` creates the `BrowserWindow`; it loads `ELECTRON_RENDERER_URL` in dev and `out/renderer/index.html` when built.
- `src/preload/` — runs before the page with `contextIsolation` on and `sandbox: false`. Exposes `window.electron` (the `@electron-toolkit/preload` wrapper, which can send on any IPC channel) and `window.api` (Trowel's own API, typed as `Api` in `src/shared/api.ts`; see below). Types for both live in `src/preload/index.d.ts`, which `tsconfig.web.json` includes so the renderer sees them.
- `src/renderer/` — the React app. `index.html` sets a strict Content-Security-Policy (`script-src 'self'`, no remote connections), so inline scripts and remote resources are blocked until the CSP is changed. `@renderer` aliases `src/renderer/src` (renderer only).

Two TypeScript projects: `tsconfig.node.json` (main, preload, shared, vite config) and `tsconfig.web.json` (renderer, shared, preload `.d.ts`). Code used by both sides lives in `src/shared/` and is imported as `@shared/…` from main, preload and renderer. The alias is defined in all three sections of `electron.vite.config.ts` and in `paths` of both tsconfigs, so a new alias needs the same treatment. Both projects type-check `src/shared/`, so it must not use Node, Electron or DOM APIs.

### Database access and IPC

- Database drivers (`pg`, `mysql2`, `better-sqlite3`) run only in the main process, behind the `DbClient` interface in `src/main/db/client.ts`: one file per database (`postgres.ts`, `mysql.ts`, `sqlite.ts`), and `createClient(config)` in `src/main/db/index.ts`. The config and result types are in `src/shared/types.ts`.
- SQLite runs each session in its own Electron utility process (`sqlite.process.ts`, loaded with electron-vite's `?modulePath` import), because `better-sqlite3` is synchronous and can't interrupt a query. Killing the process is the only way to stop one, and it is immediate; SQLite's journal rolls back an interrupted write the next time the file is opened. So `disconnect` kills the process, and `cancel` kills it and opens the file in a new one, which loses the session's state (an open transaction, temp tables, attached databases, PRAGMA settings); the cancelled query's error says so. Sessions on one file lock each other as separate SQLite connections do: while one holds a write transaction, another's write waits up to better-sqlite3's 5-second busy timeout, then fails with "database is locked".
- `DbClient` contract every implementation keeps:
  - Each client holds one driver connection, so a transaction can span calls.
  - `query` rows are arrays in `columns` order, so duplicate column names survive.
  - Integers that don't fit a JS number arrive as strings, never rounded (Postgres `int8` is always a string).
  - Dates and times arrive as strings, as the database formats them, never as JS `Date`s (which would drop microseconds and read a Postgres `timestamp` in the local time zone): pg type parsers in `postgres.ts` (which also keep intervals and geometric types as text), mysql2 `dateStrings`. SQLite has no date type.
  - A statement that returns no rows gives empty `columns`/`rows` and its affected-row count.
  - Each client attaches an `'error'` listener, since an unhandled driver `'error'` event crashes the main process.
  - `cancel()` stops the running query, which then rejects, and does nothing when none is running. Postgres (`pg_cancel_backend`) and MySQL (`KILL QUERY`) cancel from a short-lived second connection, and their `disconnect` cancels first, since the server wouldn't notice a closed connection until it next sends something. Some interrupted MySQL functions return a value instead of an error: MariaDB's `BENCHMARK()` returns a row (its `SLEEP()` errors, though MySQL documents `SLEEP()` returning 1).
  - `query` keeps at most `ROW_LIMIT` rows (10,000, in `src/shared/types.ts`) and sets `truncated` when the statement returned more; there is no "load more", since that would hold a query (and on Postgres a transaction) open on the session. Postgres reads through `pg-cursor` and closes it at the limit, and SQLite stops stepping, so the database stops too: a SELECT ends early (so a function it calls that changes data runs only for the rows read), while an INSERT/UPDATE/DELETE ... RETURNING has already made all its changes. Their `rowCount` is then null, and `stopped` tells the two cases apart, from the statement's first word (`stopsAtLimit` in `src/main/db/limit.ts`); the results pane says "Stopped after 10,000 rows" or "First 10,000 rows". mysql2 can't stop the server sending rows without killing the statement (which could leave a MariaDB `INSERT ... RETURNING` half done), so MySQL streams every row through the core connection under the promise wrapper, keeps the first `ROW_LIMIT` and counts the rest into `rowCount`. Of a MySQL `CALL`'s result sets, only the first is kept. A Postgres cursor takes exactly one statement (the extended protocol), so `query` there rejects `select 1; select 2`.
- TLS: `tlsOptions(config.ssl)` in `src/main/db/tls.ts` gives both server clients their TLS options. `verify` passes an explicit `ca` list (Node's default list plus the OS store), since a `ca` option replaces Node's list rather than adding to it. Driver quirks it works around: pg reads `PGSSLMODE` unless `ssl` is set (so off is an explicit `false`); mysql2 checks the host name only with `verifyIdentity`, and not at all correctly for an IP host (so MySQL refuses `verify` with one). Connect errors go through `withoutNodeHint`, which drops Node's inapplicable `--use-system-ca` advice.
- Connect errors: both server clients pass a failed connect through `connectError` (`src/main/db/errors.ts`). Where the driver's message is only a code (refused, host not found, timed out, unreachable), it becomes plain words, a blank line, then the driver's message; the connect screen shows the first paragraph as the error and the rest as detail. pg uses `GuardedSocket` (in `postgres.ts`), because on bytes that aren't the Postgres protocol (a MySQL server's port) pg throws inside the socket's `data` handler, which nothing can catch: it would be an uncaught exception in the main process and a connect that never settles. The guard turns it into a socket error.
- Scripts: the query tab splits its SQL with `splitStatements` (`src/shared/split.ts`) and runs the statements one at a time, stopping at the first error, as psql, the mysql client and sqlite3 do. The splitter follows each database's lexical rules (quotes and escapes, comments, Postgres dollar quotes, MySQL `DELIMITER` and executable comments, BEGIN ... END bodies of triggers and routines); `split.test.ts` lists the cases. `DbClient.query` still takes one statement.
- The renderer reaches the database only through `window.api`. New features should not use the raw `window.electron.ipcRenderer`. To add a method:
  1. Declare it in `Api` in `src/shared/api.ts`.
  2. Implement it in the group's `Handlers` object in `src/main/ipc.ts`, with the same signature plus a leading `IpcMainInvokeEvent`. `handle(group, handlers)` registers each method as channel `<group>:<method>`.
  3. Map it in `src/preload/index.ts` to `invoke('<group>:<method>', …)`.
- Handlers just throw on failure. `handle()` returns an `IpcResult` envelope, and preload rethrows it as a plain `Error` carrying only the message, since custom error properties don't survive `contextBridge`. So the renderer sees a clean `e.message`, without Electron's "Error invoking remote method" prefix. An `AggregateError` with an empty message (Node's, when connecting to `localhost` fails on both `::1` and `127.0.0.1`) is reported as its inner errors' messages (`errorMessage` in `src/main/db/errors.ts`).
- Sessions: `api.db.connect(config)` returns a UUID connection id, whose own session (one `DbClient`) the sidebar and table tabs use. `api.db.openSession(connectionId)` opens another session, a new `DbClient` from the same config, and returns its id; `query` and `cancel` take either id. Each query tab opens a session on its first run and closes it with the tab (`features/query/run.ts`), so tabs run side by side, Cancel stops only its own tab's query, and transactions, temp tables and settings stay in their tab. An in-memory SQLite database exists only in its one connection, so `openSession` returns the connection id for `:memory:`. `ipc.ts` keeps connections and sessions in `Map`s; disconnecting closes a connection's sessions too, and a window's connections close when that window closes or reloads.
- `registerIpc()` in `src/main/ipc.ts` registers everything and is called from `src/main/index.ts`.

### Saved connections

- `src/main/connections.ts`, exposed as `api.connections.list/save/remove`. They are stored configs, not open connections: the renderer passes a saved `config` to `api.db.connect`.
- Stored in `trowel.db` in `app.getPath('userData')` (`~/Library/Application Support/trowel` on macOS), opened in the main process with `better-sqlite3`, which is fine for a table this small. Schema changes go in `MIGRATIONS`, tracked by `pragma user_version`: append a new entry, never edit one that has shipped.
- The config is JSON without its password, so new config fields (e.g. SSL) need no migration. A new secret field would need encrypting like the password.
- Passwords are in their own column, encrypted with the async `safeStorage` calls, and come back decrypted in `list()`: protected at rest, not hidden from the renderer. `save` throws if no system keychain is available, rather than store a password safeStorage can only obfuscate; a password that can't be decrypted lists as empty.

### Renderer

- No router: `App` shows `ConnectScreen` or `Workspace` depending on the Zustand session store (`store/session.ts`). Open tabs are in `store/tabs.ts`: `tabs` (each `query` with its `sql`, latest `run` and `sessionId` once opened, or `table` with its `TableRef`), `root`, the tree of panes that splits the tab area as VS Code's editor groups do (`store/panes.ts`, pure functions with unit tests: each pane has its tab ids and active tab, each split a direction and its children's sizes), and `focusedPaneId`, the pane New query and the sidebar act on (clicking in a pane focuses it). `features/workspace/Panes.tsx` renders the panes as one flat list keyed by pane id and absolutely positioned from the tree, so splitting, resizing or maximizing never remounts a pane (its editor keeps its undo history, its grid its scroll); each has a `TabBar` (its right-click menu is `components/ContextMenu.tsx`), and draggable lines between them resize. `maximizedPaneId` makes the focused pane fill the tab area, the others hidden but mounted; focusing another pane restores the layout (a store subscriber enforces it). `shortcuts.ts` has `Cmd+\` (split) and `Cmd+1` to `Cmd+9` (focus a pane). Split copies a tab into a new pane (a query's SQL, or the same table), as VS Code does; "Move to a new pane" moves it. Only each pane's active tab is mounted, and a tab that moves to another pane remounts, so anything a tab must keep (like a query's result) belongs in the store; `features/query/run.ts` writes a run's outcome there, so it lands even if the tab was switched away, and handles Cancel and the tab's session (closing a tab closes its session, which stops its running query). If a router is ever added, use `HashRouter` or `MemoryRouter`, since the packaged app loads from `file://`.
- Code is grouped by feature under `src/renderer/src/features/` (`connect`, `workspace`, `sidebar`, `query`, `table`, `json-viewer`); shared primitives (`Button`, `IconButton`, `TextInput`, `Field`, `Segmented`, `DbMark`) are in `components/ui.tsx`, icons in `components/icons.tsx`. The side panels (saved connections, tables list, row panel) are `components/SidePanel.tsx`: drag their inner edge to resize, down to a minimum, while the `MainArea` beside them keeps at least 400px; their widths are in `store/layout.ts`, kept in localStorage. A tab row or list of items is one Tab stop whose arrow keys move between its items (`components/roving.ts`): only its current item has `tabIndex` 0.
- Styling is Tailwind CSS v4 (`@tailwindcss/vite`, `src/renderer/src/assets/main.css`). Keep any other CSS inside `@layer`, since unlayered rules override Tailwind utilities. Colours are CSS variables mapped to utilities (`bg-surface`, `text-muted`, `border-line`, `bg-accent`, ...) with light and dark values following the OS theme; use those rather than raw palette colours.
- Each database type has a colour, and `data-db="<type>"` on an element makes it the `accent` inside: the workspace is tinted by its connection's type, the connect form by the selected type.
- A `className` passed to a `components/ui.tsx` component should only add layout. Two utilities for the same property resolve by Tailwind's CSS order, not class order, so a caller can't reliably override the component's own padding, size or colour; add a prop instead (like `IconButton`'s `size`).
- The `react-hooks` lint rules include `set-state-in-effect`: load data in an effect with `.then(...)` callbacks guarded by a `current` flag, and re-run it by bumping a counter in its dependencies (see `TableList`), rather than calling a state-setting function from the effect body.
- Query results use `components/ResultGrid.tsx` (AG Grid Community; modules registered once in `main.tsx`). Rows are arrays, so each column reads its value by index. The editor is CodeMirror 6 through `@uiw/react-codemirror`, set up in `features/query/editor.ts`. Both are themed with the app's CSS variables (AG Grid `themeQuartz.withParams`, CodeMirror `EditorView.theme`), so they follow the OS theme and the accent with no reconfiguring.
- One exception to keeping CSS in `@layer`: overrides of AG Grid's own rules, which are unlayered, so a layered rule would lose to them.

## pnpm and native modules

- pnpm 11 only reads auth/registry settings from `.npmrc`; other pnpm settings go in `pnpm-workspace.yaml`.
- `pnpm-workspace.yaml` sets `nodeLinker: hoisted` (flat `node_modules`, which electron-builder and native-module rebuilds expect). Changing it requires deleting `node_modules` and running `pnpm install` again.
- Dependencies with install scripts must be listed under `allowBuilds` in `pnpm-workspace.yaml`, or `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS` (e.g. add `better-sqlite3: true` when adding it).
- `postinstall` runs `install-electron` (downloads the Electron binary) and `electron-builder install-app-deps` (rebuilds native modules for Electron's Node ABI). `electron-builder.yml` sets `npmRebuild: false`, so packaging relies on that postinstall rebuild; on a `NODE_MODULE_VERSION` error run `pnpm exec electron-builder install-app-deps`.
- Do not read `.npmrc`: a user hook blocks any Bash command that mentions it, because it can hold auth tokens. It is gitignored.

## Template placeholders still to replace

`appId: com.electron.app` and `publish.url` (example.com) in `electron-builder.yml`, `setAppUserModelId('com.electron')` in `src/main/index.ts`, and `author`/`homepage` in `package.json`.

## Beekeeper Studio reference and licensing

A clone of Beekeeper Studio lives at `~/projects/beekeeper-studio` for reference.

- Don't copy or port any of its code (the user's decision). Its `apps/studio/src-commercial/` is under a commercial license and the rest is GPLv3. Use the clone only to see how it approaches a problem, then write Trowel's own code.
- Don't use the Beekeeper Studio name or logo.

## Code style

- Prettier: single quotes, no semicolons, 100-column lines, no trailing commas; 2-space indent.
- ESLint (`@electron-toolkit/eslint-config-ts`) requires explicit return types on functions in `.ts`/`.tsx` (typed expressions and callbacks are exempt), forbids `any`, and only allows `@ts-ignore` with a description. React hooks and react-refresh rules are on.
