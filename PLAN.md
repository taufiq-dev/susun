# Trowel build plan

Progress tracker for building Trowel. Tick steps off as they land and keep "Open decisions" current.
Architecture and conventions are in `CLAUDE.md`; this file is the order of work.

## Open decisions (ask the user before acting)

- **License for Trowel** (MIT, GPLv3 or closed): needed before distributing it (step 13).

## Decided

- **Unsaved SQL: a save prompt, query files and a Settings window** (the user's choices). Closing a query tab
  with unsaved SQL, disconnecting, closing the window or quitting asks first, in the native dialog (a sheet on
  macOS) with Save, Don't Save, Cancel and "Don't ask again"; Disconnect uses it too, in place of its
  two-click confirmation. Save writes a `.sql` file, through the Save dialog, and the tab stays on that file
  (rather than a saved-queries list inside Trowel). "Don't ask again" turns off a setting in a separate
  Settings window (Trowel > Settings…, Cmd+,), which needs a custom app menu.
- **Split panes, as in VS Code.** The tab area splits right or down, nested, into resizable panes, each with
  its own tabs; tabs move between panes by dragging, or onto a pane's edge to split it. One of the reasons
  for building Trowel: Beekeeper Studio shows one tab at a time.
- **Each query tab has its own database session**, opened on its first run and closed with the tab; the
  sidebar and table tabs share the connection's own session. Sharing one session was already wrong with one
  tab visible (measured on Postgres with two tabs running: Cancel in tab B stopped tab A's query and B's ran
  on; a statement from tab B ran inside the transaction tab A had opened). Own sessions let tabs run side
  by side, make Cancel stop only its tab, and keep BEGIN, temp tables and SET in their tab. Costs: one
  server connection per query tab that has run, about 2 MB on a Postgres server (measured) and a slot of
  its `max_connections`, which on a production database it shares with the application; on SQLite one more
  process, about 15 MB (measured), and a tab holding a write transaction makes other tabs' writes wait
  (better-sqlite3's 5-second busy timeout, then "database is locked"). Opening one took 32 ms on local
  Postgres and 61 ms on SQLite. No extra compute: idle sessions run nothing (Trowel sends no keepalive
  queries), and a serverless database (Neon, Aurora Serverless v2) is kept awake by any open connection,
  which the connection's own session already is. Uncommitted work in a tab isn't seen by other tabs, table
  tabs or the sidebar. Not done: closing sessions that have been idle a while (would free connection slots,
  and let a serverless database scale to zero, at the cost of the session's state).
- **One connection per window.** Panes split the tabs of the window's connection; a New Window command opens
  another connection beside it. Tabs record their connection, so mixing connections in one window could be
  added later (the sidebar, the session store and the accent would need to know about several).
- **Results stay under each query tab's editor**, not in one panel shared by all panes. A shared panel was
  built and dropped before committing: it gave results the full width, but showed one result at a time (so
  two queries side by side couldn't be compared, which is much of the point of split panes), put results
  away from the query that made them, and redrew the grid on each switch. DataGrip, DBeaver and TablePlus
  also keep results with their editor. For room, a pane can be maximized instead (step 10c).

- **No Beekeeper Studio code.** None of it is copied or ported, GPLv3 or commercial. The clone is only for
  seeing how it approaches a problem.
- **Scripts: one result per statement, split by Trowel.** The editor's SQL is split into statements and they
  run one at a time on the connection, stopping at the first error, as psql, the mysql client and sqlite3 do:
  each commits on its own unless the script has its own BEGIN/COMMIT, and statements before an error keep
  their effect. No mysql2 `multipleStatements`. The splitter is our own, in `src/shared/`, following each
  database's lexical rules. sql-query-identifier 3.2.0 (MIT) was tried and rejected: it splits inside MySQL
  strings with a backslash-escaped quote (`'it\'s'`, MySQL's default escaping), Postgres `E'…'` strings and
  nested comments, and SQLite `[bracketed]` names, and it passes `DELIMITER` lines through as statements.
- **Cancel for all three databases.** SQLite moves from a worker thread to an Electron `utilityProcess` per
  connection, because `better-sqlite3` has no interrupt and `worker.terminate()` waits for the running native
  call (so today a SQLite query can't be stopped, and quitting waits for it: measured 8.4 s). Cancelling kills
  the process and reopens the file, which rolls back an open transaction and loses temp tables, attached
  databases and PRAGMA settings; the UI says so. Postgres (`pg_cancel_backend`) and MySQL (`KILL QUERY`) cancel
  from a short-lived second connection and stop only the running statement.
- **SQLite off the main process: worker thread per connection** (option 1 of three; the others were a
  utility process for all drivers as Beekeeper Studio does, or leaving it). Measured during a 9.8 s SQLite
  query: Postgres answered in 3–7 ms, and a second SQLite connection in 3 ms. It doesn't make queries
  cancellable, so step 9c replaces the worker with a utility process per connection (see above).
- **SSL: `ssl: 'off' | 'require' | 'verify'`** on Postgres/MySQL configs (`src/main/db/tls.ts`). Require encrypts
  but accepts any certificate, so it doesn't stop a man in the middle; Verify checks the chain against Node's
  bundled CAs plus the OS store, and the host name. MySQL refuses Verify with an IP host, because mysql2 checks
  the certificate against "localhost" there. A CA certificate file field (for RDS without installing its CA)
  can come later. Tested against Postgres 18 and MariaDB 13 with a test CA, untrusted and then trusted through
  `NODE_EXTRA_CA_CERTS`; a CA installed in the macOS keychain is untested.

- **Row limit: keep the first 10,000 rows of each statement, no "load more".** Loading more later would
  mean holding the query open between clicks: on Postgres that keeps a transaction open (holding its locks
  and snapshot) and the session busy, which was then the connection every tab shared and since step 10a is
  the tab's own, and mysql2 can't do it at all. Re-running with a higher limit would repeat a
  statement's changes. The table tab pages with its own `LIMIT`; getting every row of a big query would be
  an export to a file, not planned yet.

## Steps

- [x] **1. Prerequisites** — Node 24.22.1, pnpm 11.24.0.
- [x] **2. Scaffold** — electron-vite `react-ts` template; `pnpm dev` opens the window.
- [x] **3. Dependencies** — also set `nodeLinker: hoisted`, removed the Electron download mirror, and deleted
  the template's `base.css` (its unlayered resets would override Tailwind's layered utilities).
  - Add `better-sqlite3: true` under `allowBuilds` in `pnpm-workspace.yaml` first.
  - Main process: `pnpm add pg mysql2 better-sqlite3` and `pnpm add -D @types/pg @types/better-sqlite3`.
  - Renderer: `pnpm add zustand ag-grid-community ag-grid-react @uiw/react-codemirror @codemirror/lang-sql @codemirror/lang-json`.
  - Styling: `pnpm add -D tailwindcss @tailwindcss/vite`; add `tailwindcss()` to `renderer.plugins` in
    `electron.vite.config.ts`; put `@import "tailwindcss";` at the top of `src/renderer/src/assets/main.css`
    and remove the template's demo styles.
- [x] **4. Folder layout** — `src/shared/types.ts`; `src/main/{ipc.ts,connections.ts,db/}`;
  `src/renderer/src/{store,features/{connect,sidebar,query,table,json-viewer}}`. Add an `@shared` alias in all
  three sections of `electron.vite.config.ts` and in `paths` of both `tsconfig.node.json` and `tsconfig.web.json`
  (and include `src/shared` in both). Done: empty folders hold a `.gitkeep` (delete it when the first file lands);
  `src/shared/types.ts` has `DB_TYPES`/`DbType`; the template's `ping` handler moved into `registerIpc()` in
  `ipc.ts`. `connections.ts` is left for step 7 rather than added as an empty module.
- [x] **5. `DbClient` interface** — `src/main/db/client.ts` with `connect`, `disconnect`, `listTables`,
  `listColumns`, `query(sql, params?)`. `TableInfo`, `ColumnInfo`, `QueryResult` (`columns`, `rows`, `rowCount`,
  `durationMs`) in `src/shared/types.ts`. Implement `postgres.ts`, `mysql.ts`, `sqlite.ts`. Done, plus
  `ConnectionConfig`/`TableRef` in shared types and `createClient(config)` in `src/main/db/index.ts`. Contract
  in `CLAUDE.md`. Tested by hand against Postgres 18, MariaDB 13 and SQLite 3.53 (no test runner yet).
- [x] **6. IPC** — `src/main/ipc.ts` keeps a `Map` of open clients by connection id and registers `ipcMain.handle`
  for `db:connect`, `db:disconnect`, `db:listTables`, `db:listColumns`, `db:query`. Preload exposes matching
  methods on `window.api` via `ipcRenderer.invoke`; type them in `src/preload/index.d.ts`. Done as
  `window.api.db.*`, typed by `Api` in `src/shared/api.ts`. `connect` returns a UUID connection id, errors reach the
  renderer as plain `Error`s with the driver's message, and a window's connections close when it closes or
  reloads. Tested end to end in the built app over the DevTools protocol (Postgres 18, MariaDB 13, SQLite).
- [x] **7. Saved connections** — SQLite file under `app.getPath('userData')` via `better-sqlite3`; encrypt
  passwords with `safeStorage.encryptString()`. Done as `src/main/connections.ts` (`trowel.db`, one
  `connections` table, `pragma user_version` migrations) and `api.connections.list/save/remove`. Uses the async
  `safeStorage` calls instead, which don't block the main process during a keychain prompt and re-encrypt after
  a key rotation. Passwords come back decrypted to the renderer. Tested end to end in the built app with a
  scratch userData folder and the mock keychain: round trips, update, restart, a corrupted password, a saved
  Postgres config connecting. Not tested against the real Keychain.
- [x] **8. App shell** — `App.tsx` renders `ConnectScreen` or `Workspace` from state. Connect screen: saved list +
  form (type, host, port, user, password, database, SSL mode defaulting to Off; file path for SQLite) + Test and
  Connect. Label Require as not protecting against a man in the middle. Workspace: tables
  left, tab bar + active tab centre, JSON viewer right. Tabs in a Zustand store `{ tabs, activeId }`, each tab
  `{ type: 'query', sql }` or `{ type: 'table', table }`. Saved connections: `list()` gives each full config,
  so the form edits it directly and Connect passes it to `api.db.connect`. Every non-empty password is saved; a
  "don't save password" option would need a password prompt on connect (and is the only way to save at all on
  Linux without a keyring, where `save` throws). Done. Also: `api.dialog.openSqliteFile()` for the file picker,
  double-click on a saved connection connects, a two-click delete, and per-database-type accent colours (see
  CLAUDE.md). The query tab is a plain text area and the table tab lists the table's columns, until steps 9
  and 11; the row panel is a placeholder (step 12) that the header button hides. Replaced the template's demo UI
  and `ping` handler; the window is now 1280x800 (min 960x600). Tested by driving the built app over the
  DevTools protocol, with screenshots in light and dark; the native file picker is untested.
  Not done: resizable side panels (since done, under step 10), keyboard shortcuts for tabs (Cmd+W would need a
  custom app menu, since the default menu closes the window), and noticing a dropped connection.
- [x] **9. Query tab** — in four parts, each committed on its own.
  - [x] **9a. Editor and results** — CodeMirror with `sql()`; Cmd+Enter runs the selection or whole editor.
    Results in AG Grid with row count and run time; show database errors in place of the grid. Register AG
    Grid modules once in `main.tsx` with `ModuleRegistry.registerModules([AllCommunityModule])`. Rows arrive
    as arrays: give each grid column the index as its `field` (or a `valueGetter`), not the column name, which
    may repeat. Only the active tab is mounted, so keep each tab's last result in the tabs store (or keep tabs
    mounted), or switching tabs throws it away. Done: `QueryTab` (editor, a bar with Run and
    the run's status, results) with a draggable, keyboard-resizable split; `ResultGrid` shows NULL in muted
    italics (unlike the text 'NULL'), binary as hex (first 32 bytes) and JSON as text, and sizes columns to
    their contents up to 360 px. Dates and times now arrive as strings as the database formats them (see
    CLAUDE.md). Tested in the built app against Postgres 18, MariaDB 13 and SQLite. Not done: completing
    table and column names (the editor completes keywords only). A row limit came in 9d.
  - [x] **9b. Scripts** — the splitter in `src/shared/` (quotes, comments and identifiers per database,
    Postgres dollar quoting, MySQL `DELIMITER`, trigger and procedure bodies), with Vitest as the test runner.
    A result tab per statement that returns rows, a one-line summary for the rest, and an error that names
    the failing statement and its line. Done: `splitStatements` in `src/shared/split.ts` with 54
    Vitest cases; the results pane shows a tab per statement with rows and a Statements list (line, first
    line of SQL, outcome, time; a line number selects that statement in the editor; the failing statement's
    error under it). Until one is picked, a finished script shows its last rows, a failed one the list.
    Tested in the built app by restoring a `pg_dump --inserts` (533 statements: plpgsql trigger, `BEGIN
    ATOMIC` function) and a `mariadb-dump --routines --triggers` (84 statements: `DELIMITER ;;` trigger and
    procedure) into empty databases, and a SQLite trigger script. Not handled: psql meta-commands (`\connect`,
    and the `\restrict` lines pg_dump 18 writes) go to the server and fail; pg_dump's default `COPY ... FROM
    stdin` format needs psql.
  - [x] **9c. Cancel** — first check that killing a utility process is immediate while it is inside a
    long native SQLite call (the 10-second query test). Then SQLite in a `utilityProcess`, and
    `api.db.cancel(connectionId)` for all three; Cancel also stops a script. Done. Measured first in a
    bare Electron app: killing the process exited 5–14 ms after the kill, mid-query; a large insert
    killed midway left the file passing `integrity_check` with the insert rolled back, in both rollback
    and WAL journal modes. In the app, Run becomes Cancel while a run is going; closing a tab cancels
    its query, and Postgres and MySQL `disconnect` cancel first. Tested in the built app: Postgres and
    SQLite queries stop within milliseconds of Cancel and the connection keeps working (a SQLite temp
    table is gone afterwards, as the message says); closing a tab mid-`pg_sleep` leaves nothing running on
    the server; disconnecting or quitting during a long SQLite query takes about 0.2 s (it used to wait for
    the query). MariaDB's `BENCHMARK()` stops early on `KILL QUERY` but returns a row, so a run Cancel was
    asked for shows as cancelled even when its last statement returned. Not done: a keyboard shortcut for
    Cancel.
  - [x] **9d. Row limit** — each statement keeps its first 10,000 rows (`ROW_LIMIT`), and the status says so:
    "Stopped after 10,000 rows" for a Postgres or SQLite SELECT, which stops running at the limit (a function it
    calls that changes data runs for only the first 10,001 rows: tested); "First 10,000 rows" for an
    INSERT/UPDATE/DELETE ... RETURNING, which has made all its changes; "First 10,000 of 2,000,000 rows" on
    MySQL, which reads every row anyway. A tooltip says which happened and why. Postgres reads through
    `pg-cursor` (new dependency) and SQLite steps row by row, both stopping at the limit; MySQL streams and
    drops the rest (see CLAUDE.md). Measured with a 2-million-row select through `window.api`: before, 47 s
    until the renderer had the rows (1.4 s of it in the driver, the rest copying them over IPC), with peak
    memory of 576 MB in the main process and 728 MB in the renderer; after, 0.16 s on Postgres and 0.8 s on
    MariaDB, with no growth in the renderer and at most 13 MB in the main process. Tested in the built app
    against Postgres 18, MariaDB 13 and SQLite (and `stopsAtLimit` in Vitest): exactly 10,000 rows isn't marked
    as cut short, 10,001 is; a DELETE ... RETURNING of 25,000 rows (and a Postgres data-modifying CTE, and a
    MariaDB and SQLite INSERT ... RETURNING) still changes all 25,000; types, params, transactions across calls,
    VACUUM and CREATE INDEX CONCURRENTLY work through the cursor; Cancel works during a Postgres cursor read and
    while MariaDB streams 100 million rows.
- [ ] **10. Panes and sessions** — in five parts, each committed on its own (see "Decided").
  - [x] **10a. A session per query tab** — `api.db.openSession`/`closeSession`; `query` and `cancel` take a
    session id (or a connection id, for the connection's own session). A query tab opens its session on its
    first run and closes it with the tab, which stops a query still running there; disconnecting or closing
    the window closes them all. The status says "Connecting…" while a tab's session opens; if it can't open,
    "Couldn't connect" and the server's error, with nothing run (the next run tries again). Cancel while
    connecting stops the run once the session is open. An in-memory SQLite database (`:memory:`) has only
    the connection's session, which its tabs share. Tested in the built app against Postgres 18, MariaDB 13
    and SQLite, checking the server's own list of sessions: one session after connecting, one more per query
    tab that has run; a 1 s query in one tab finished in 1 s while another tab ran a 3 s one; Cancel in one
    tab left the other tab's query running to the end; a row inserted in a tab's open transaction wasn't
    seen by another tab until COMMIT; `SET`, MySQL `USE` and SQLite temp tables stayed in their tab, and a
    temp table survived a SQLite Cancel in another tab; closing a tab mid-query ended its session and the
    query on the server; reloading and disconnecting (also mid-query) closed every session; a role limited
    to one connection showed "Couldn't connect: too many connections for role" in its tab while the sidebar
    worked; a SQLite write behind another tab's open write transaction failed after 5.4 s with "database is
    locked", and worked after that tab committed. The step 9 tests still pass, including both dump restores.
    Not done: noticing a session that died (a server restart, a network drop, a serverless database scaling
    to zero); the tab then shows the driver's error on each run until it is closed, as the connection's own
    session already did.
  - [x] **10b. Split panes** — the tabs store holds a tree of panes (`store/panes.ts`), each with its tabs and
    active tab; splits run side by side or one above another, nested, with draggable splitters (also moved
    with the arrow keys; a pane isn't resized below 160 px wide or 100 px tall). One pane is focused (the
    accent line on its active tab): New query and the sidebar act on it. As in VS Code, Split (the tab bar's
    button, Alt-click for down, `Cmd+\`, or the tab's right-click menu) opens a copy of the tab in a new pane:
    a query tab with the same SQL, or the same table; "Move to a new pane on the right / below" in the menu
    moves it instead. New panes in a split of equal panes even them out, otherwise they take half the pane
    split (VS Code's default). `Cmd+1` to `Cmd+9` focus a pane. Closing a pane's last tab removes the pane.
    Opening a table already open in another pane goes to that pane. The editor's share of a query tab is now
    per tab (new ones start with the last share set); `store/layout.ts` is gone. Tested in the built app
    against Postgres: two queries in two panes ran at once (two 2 s queries done in 2.0 s); split, move,
    the menu (moves disabled for a pane's only tab; Escape closes it), a query still running when its tab
    moved to a new pane finished there, `Cmd+1`/`Cmd+3`/`Cmd+\`, dragging and arrow keys on a splitter,
    closing a pane's only tab (its session closed too), and disconnecting back to one empty pane; the tree
    functions have 11 unit tests. The 10a session tests and the 9a query tests still pass.
  - [x] **10c. Maximize a pane** — as in VS Code: a pane fills the tab area until restored (a tab bar button
    shown when there are several panes, double-clicking a tab, or the tab menu). The other panes stay
    mounted but hidden, so their editors and grids keep their state. Focusing another pane, splitting, or
    closing the pane restores the layout. No keyboard shortcut yet (VS Code's is the chord Cmd+K Cmd+M).
    Also fixes a 10b bug found while testing it: a pane whose place in the tree changed (the pane being
    split, which moves into a new split) was remounted, losing its editor's undo history and cursor and its
    grid's scroll. Panes are now one flat list keyed by id, absolutely positioned from the tree, so they
    never remount. Tested in the built app: the maximized pane filled the tab area (752x728) with the others
    hidden and no splitters; the grid kept its scroll and the editors their undo history (Cmd+Z after a
    split and after maximizing undid an earlier edit); the button, double-click and menu item toggle it;
    Cmd+3, splitting and closing the maximized pane's last tab restored the layout; with one pane the
    button is hidden and the menu item disabled. The 10a, 10b and step 9 tests still pass.
  - [x] **Resizable side panels** (asked for after 10c) — the saved connections list, the tables list and the
    row panel: drag the line at their inner edge, or focus it and use the arrow keys (16 px a press);
    double-clicking it restores the default width. `components/SidePanel.tsx`; the widths are in
    `store/layout.ts`, kept in localStorage between launches. Minimums: connections 180 px, tables 160 px,
    row 200 px. The main area beside them keeps at least 400 px, so a drag stops there, and in a narrower
    window the panels shrink first, down to their minimums. Also: the window's background now matches the
    theme, so a quick resize of the window no longer shows white strips in dark mode. Tested in the built
    app: drags, the minimums and the 400 px limit, keys, double-click, the widths surviving a reload and the
    row panel being hidden and shown, the panels giving way at 960 px wide, and the tables list's edge
    taking the pointer over the editor's gutter, which has its own z-index.
  - [x] **Design review fixes** (from a review against design-engineering principles; the user chose fixes 1-5
    together, then 6 on its own) —
    1. Disconnect asks for a second click ("Close 2 query tabs and disconnect") when a query tab has SQL or a
       running query; clicking elsewhere or Escape takes it back. Closing a query tab or the window still
       loses its SQL with no warning or undo.
    2. No layout shift: the connect form's buttons keep their labels while busy (the status line says
       "Connecting…", "Testing the connection…"), Cancel stays "Cancel" while cancelling (the status says
       so), and the selected Type/SSL option and result tab no longer turn bolder.
    3. A tab bar or a script's result tabs scroll the selected tab into view (`useRevealSelected`).
    4. Reloading the tables list keeps the old list, and its scroll, until the new one arrives.
    5. Connection errors whose driver message is only a code say what's wrong in plain words, with the
       driver's message beneath (`src/main/db/errors.ts`). Testing them found that pg pointed at a MySQL or
       MariaDB port threw inside its socket handler, uncatchable, which in the main process would have been
       an uncaught exception and a connect that never settled; a guarded socket now fails the connect.
    Tested in the built app: refused, host not found, Postgres to the MariaDB port, MySQL to the Postgres
    port (10 s timeout) and a bad password (unchanged); button, option and tab widths before and during
    each state; 14 tabs and 30 result tabs scrolled to the selected one; no "Loading tables…" on reload;
    Disconnect with real mouse clicks. The 10a-10c, 9a and 9c tests still pass.
  - [x] **Keyboard navigation** (design review fix 6) — a tab bar, a script's result tabs and the tables list
    are each one Tab stop (`components/roving.ts`): the arrow keys, Home and End move within them. In a tab
    bar the arrows move the focus and Enter opens the tab (opening one focuses its editor, which would end
    the arrowing); Delete or Backspace closes the focused tab, since the close buttons aren't Tab stops; the
    result tabs show the result as the arrows reach it. In the tables list Down and Up move, Up from the
    first table returns to the filter, and in the filter Down enters the list and Enter opens the only
    match (or, with several, goes to the first). A tab menu choice returns the focus to the tab before it
    runs, and Split, Move and Close then focus the pane they leave active, as Cmd+\ does. Tested in the
    built app with real key presses; the 10b, 10c and fixes 1-5 tests still pass.
  - [x] **Title bar in the theme** (asked for after the design fixes) — macOS can't recolour its title bar, so
    on macOS the window has none (`titleBarStyle: 'hidden'`) and the page's 40 px top band takes its place:
    the workspace header, or on the connect screen the sidebar's name row and an empty band over the form.
    The traffic lights sit at (14, 13) in its first 80 px; the band drags the window, and what's clickable
    in it is marked no-drag. Windows and Linux keep their system title bar. Tested in the built app: no
    title bar (content starts at the window's top), the bands' sizes and drag regions, the header's buttons
    and the side panel's edge left clickable. Not checked by eye in the test, since the traffic lights
    aren't in page screenshots. Not done: in macOS full screen the lights hide but the 80 px stays empty.
  - [x] **Run row** (asked for after the title bar) — the bar between editor and results was a full-width
    strip with a fill and borders; the run status and the Run (or Cancel) button now sit along the editor's
    foot in its own colour, status on the left and Run on the right, above a single line that drags to
    resize (it was the strip's top edge). Tested in the built app: no fill or borders, Run 8 px from the
    pane's edge, the line following a 100 px drag; the 9a, fixes and keyboard tests still pass.
  - [ ] **10d. Drag tabs** — reorder within a tab bar, move to another pane, or drop on a pane's edge to split.
  - [x] **Save prompts, query files and Settings** (asked for after the Run row; see "Decided") —
    - An app menu (`menu.ts`): Settings… (Cmd+,); File: New Query (Cmd+T), Open… (Cmd+O), Save (Cmd+S), Save
      As… (Cmd+Shift+S), Close Tab (Cmd+W; with no tab, or in Settings, it closes the window), Close Window
      (Cmd+Shift+W); Edit; View (Reload and DevTools only in development, since reloading loses the tabs);
      Window. The File commands go to the focused window's page (`AppCommand`, `commands.ts`).
    - Query tabs on files: Open and Save As through the native dialogs; the tab is titled with the file's
      name (its path in the tooltip), Cmd+S writes it without asking, opening a file already open goes to its
      tab, and splitting a tab on a file gives a copy on the same file. A tab with unsaved SQL (changed since
      read or saved, or not on a file and not empty) shows a dot in place of its close button until hovered.
      A window writes only files its user picked in its own dialogs.
    - The save prompt (`api.app.confirmSave`): one tab names it ("Do you want to save the changes to
      “Query 1”?"); several are listed, with Save All, which shows each tab as its Save dialog opens and stops
      at the first one cancelled. The message says why: before disconnecting, closing the window or quitting.
    - Closing a main window is held back until its page has settled its unsaved tabs (`windows.ts`); a
      cancelled close also cancels a quit, which starts again once the window may close.
    - Settings: a `settings` table in trowel.db (migration 2; `store.ts` now holds the migrations) and a
      Settings window with one setting, "Ask to save a query tab's SQL before closing it", which "Don't ask
      again" turns off and every window hears about at once.
    Tested in the built app, with the main process's dialogs replaced by stubs from its inspector: each
    prompt's text and buttons and each answer (Cancel, Save, Save with the Save dialog cancelled, Don't Save,
    Save All stopping at a cancelled dialog, "Don't ask again"), Open, Cmd+S, Save As, the Settings window
    showing and changing the setting, Cmd+W there, Disconnect, closing the window and quitting (cancelled,
    then not; then a window closed after a cancelled quit closing only itself, which first quit the app: a
    bug the test found), and quitting with nothing unsaved. The 9a, 9c, 10a-10c, fixes and keyboard tests
    still pass with the prompt turned off. Not done: a running query on a tab whose SQL is saved closes with
    no prompt (Disconnect's old confirmation asked about it), and a query tab's SQL still isn't kept when
    the app quits without saving.
  - [ ] **10e. New Window** — opens another connect screen in a new window, from the File menu (the app menu
    now exists).
- [ ] **11. Table tab** — 100 rows per page via `LIMIT`/`OFFSET`. Grid sort/filter become `ORDER BY`/`WHERE` with
  parameters and per-database identifier quoting (`"name"` Postgres/SQLite, `` `name` `` MySQL). Edits: collect
  changed cells, apply one `UPDATE … WHERE <primary key> = ?` per row in a transaction; tables without a
  primary key are read-only. Table tabs share the connection's own session, so a save's transaction must not
  interleave with other table tabs' queries: give the save a session of its own, or queue the others.
- [ ] **12. JSON viewer** — selected row as `JSON.stringify(row, null, 2)` in read-only CodeMirror with `json()`
  (folding included), plus a key filter box. Build the row object from `columns` (suffix repeated names, e.g.
  `id`, `id_2`). Convert first: `Uint8Array` → hex, Postgres `bigint` arrives as a
  string, dates → ISO strings. Postgres/MySQL JSON columns arrive parsed and show as nested objects.
- [ ] **13. Packaging** — replace the template placeholders listed in `CLAUDE.md`; `pnpm build:mac` (or
  `build:win`/`build:linux`) writes installers to `dist/`. Sharing on macOS without warnings needs an Apple
  Developer account for signing and notarization. Check that SQLite works in the packaged app: its utility
  process (`sqlite.process.ts`) loads the native `better-sqlite3` from inside the asar, untested so far. Settle the app name (`trowel` now) before anyone relies on
  saved connections: the userData folder and the keychain entry (`<name> Safe Storage`) are both named after it,
  so a rename later loses saved connections or lists their passwords as empty.
