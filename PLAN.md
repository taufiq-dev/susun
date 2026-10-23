# Trowel build plan

Progress tracker for building Trowel. Tick steps off as they land and keep "Open decisions" current.
Architecture and conventions are in `CLAUDE.md`; this file is the order of work.

## Open decisions (ask the user before acting)

- **License for Trowel** (GPLv3 vs MIT/closed): decides whether any Beekeeper Studio GPLv3 code may be ported.
- **Multi-statement scripts**: `query` returns one result. Postgres runs a multi-statement script (no params)
  and returns the last result; MySQL and SQLite reject it. A result per statement would need SQL splitting for
  SQLite, plus `multipleStatements` for mysql2. Decide before step 9.
- **SSL/TLS** for Postgres and MySQL: not in `ServerConnectionConfig` yet. Most hosted databases (RDS, Neon,
  Supabase, PlanetScale) require it. Decide before step 8's form.
- **SQLite blocks the main process** (decide before step 6, since option 2 changes the IPC layer):
  `better-sqlite3` is synchronous, so a slow SQLite query blocks the main process until it ends. The window
  stays drawn and React still responds, but every database call, native menu and file dialog waits, and
  the query can't be cancelled.
  - Beekeeper Studio, for comparison: uses the same driver and also runs SQLite queries synchronously, and its
    SQLite `cancel()` doesn't interrupt a running query (`apps/studio/src/lib/db/clients/sqlite.ts`). But it runs
    every database client in an Electron utility process that the renderer reaches over a `MessagePort`
    (`src/lib/utility/UtilityConnection.ts`). So the main process, window and menus stay free, while other
    database requests still queue behind the slow query.
  - Option 1, worker thread for SQLite only: the smallest change, limited to `sqlite.ts`. Postgres and MySQL
    aren't held up, and terminating the worker cancels the query.
  - Option 2, utility process for all drivers (Beekeeper's approach): needs a separate entry point and a
    `MessagePort` instead of `ipcMain.handle`. It also keeps a native driver crash from taking down the main
    process.
  - Option 3, keep it as is: fine for small SQLite files.

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
- [ ] **6. IPC** — `src/main/ipc.ts` keeps a `Map` of open clients by connection id and registers `ipcMain.handle`
  for `db:connect`, `db:disconnect`, `db:listTables`, `db:listColumns`, `db:query`. Preload exposes matching
  methods on `window.api` via `ipcRenderer.invoke`; type them in `src/preload/index.d.ts`.
- [ ] **7. Saved connections** — SQLite file under `app.getPath('userData')` via `better-sqlite3`; encrypt
  passwords with `safeStorage.encryptString()`.
- [ ] **8. App shell** — `App.tsx` renders `ConnectScreen` or `Workspace` from state. Connect screen: saved list +
  form (type, host, port, user, password, database; file path for SQLite) + Test and Connect. Workspace: tables
  left, tab bar + active tab centre, JSON viewer right. Tabs in a Zustand store `{ tabs, activeId }`, each tab
  `{ type: 'query', sql }` or `{ type: 'table', table }`.
- [ ] **9. Query tab** — CodeMirror with `sql()`; Cmd+Enter runs the selection or whole editor. Results in AG Grid
  with row count and run time; show database errors in place of the grid. Register AG Grid modules once in
  `main.tsx` with `ModuleRegistry.registerModules([AllCommunityModule])`. Rows arrive as arrays: give each
  grid column the index as its `field` (or a `valueGetter`), not the column name, which may repeat.
- [ ] **10. Table tab** — 100 rows per page via `LIMIT`/`OFFSET`. Grid sort/filter become `ORDER BY`/`WHERE` with
  parameters and per-database identifier quoting (`"name"` Postgres/SQLite, `` `name` `` MySQL). Edits: collect
  changed cells, apply one `UPDATE … WHERE <primary key> = ?` per row in a transaction; tables without a
  primary key are read-only.
- [ ] **11. JSON viewer** — selected row as `JSON.stringify(row, null, 2)` in read-only CodeMirror with `json()`
  (folding included), plus a key filter box. Build the row object from `columns` (suffix repeated names, e.g.
  `id`, `id_2`). Convert first: `Uint8Array` → hex, Postgres `bigint` arrives as a
  string, dates → ISO strings. Postgres/MySQL JSON columns arrive parsed and show as nested objects.
- [ ] **12. Packaging** — replace the template placeholders listed in `CLAUDE.md`; `pnpm build:mac` (or
  `build:win`/`build:linux`) writes installers to `dist/`. Sharing on macOS without warnings needs an Apple
  Developer account for signing and notarization.
