# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trowel is a desktop database GUI (SQL editor, table browser, JSON row viewer) built with Electron, React 19, TypeScript and Vite via electron-vite. It is a from-scratch rewrite inspired by Beekeeper Studio. The repo is still the electron-vite `react-ts` template plus the planned dependencies; none of the database features exist yet.

Build progress, the remaining steps and open decisions are tracked in `PLAN.md`. Read it at the start of a session and tick its checkboxes as steps land. The repo is a git repository on `main`: commit each step as it lands.

## Commands

Package manager is pnpm 11.

```bash
pnpm dev                 # electron-vite dev server + app; renderer has HMR
pnpm dev --watch         # also rebuild/restart on main or preload changes (otherwise restart manually)
pnpm lint                # ESLint (flat config, cached in .eslintcache)
pnpm typecheck           # tsc on both TS projects; typecheck:node or typecheck:web for one side
pnpm format              # Prettier --write
pnpm build               # typecheck, then electron-vite build into out/
pnpm start               # run the built app from out/
pnpm build:mac           # package with electron-builder into dist/ (also build:win, build:linux, build:unpack)
```

`build:mac` and `build:linux` skip the typecheck (they call `electron-vite build` directly); `build:win` and `build:unpack` go through `pnpm build`. There is no test runner yet.

VS Code: the "Debug All" launch config debugs main and renderer together (renderer attaches on port 9222).

## Architecture

electron-vite builds three targets from `electron.vite.config.ts`, output to `out/main`, `out/preload`, `out/renderer`:

- `src/main/` — Electron main process (Node). `index.ts` creates the `BrowserWindow`; it loads `ELECTRON_RENDERER_URL` in dev and `out/renderer/index.html` when built.
- `src/preload/` — runs before the page with `contextIsolation` on and `sandbox: false`. Exposes `window.electron` (the `@electron-toolkit/preload` wrapper, which can send on any IPC channel) and `window.api` (custom, currently empty). Types for both live in `src/preload/index.d.ts`, which `tsconfig.web.json` includes so the renderer sees them.
- `src/renderer/` — the React app. `index.html` sets a strict Content-Security-Policy (`script-src 'self'`, no remote connections), so inline scripts and remote resources are blocked until the CSP is changed. `@renderer` aliases `src/renderer/src` (renderer only).

Two TypeScript projects: `tsconfig.node.json` (main, preload, shared, vite config) and `tsconfig.web.json` (renderer, shared, preload `.d.ts`). Code used by both sides lives in `src/shared/` and is imported as `@shared/…` from main, preload and renderer. The alias is defined in all three sections of `electron.vite.config.ts` and in `paths` of both tsconfigs, so a new alias needs the same treatment. Both projects type-check `src/shared/`, so it must not use Node, Electron or DOM APIs.

Main-process IPC handlers are registered in `src/main/ipc.ts` (`registerIpc()`, called from `index.ts`).

### Planned architecture (agreed with the user, not built yet)

- Database drivers (`pg`, `mysql2`, `better-sqlite3`) run only in the main process, behind one `DbClient` interface (`connect`, `disconnect`, `listTables`, `listColumns`, `query`) with one implementation file per database. PostgreSQL, MySQL and SQLite first. **Built:** `src/main/db/` (`client.ts` interface, `postgres.ts`, `mysql.ts`, `sqlite.ts`, `createClient(config)` in `index.ts`); the config and result types are in `src/shared/types.ts`.
- `DbClient` contract every implementation keeps:
  - Each client holds one driver connection, so a transaction can span calls.
  - `query` rows are arrays in `columns` order, so duplicate column names survive.
  - Integers that don't fit a JS number arrive as strings, never rounded (Postgres `int8` is always a string).
  - A statement that returns no rows gives empty `columns`/`rows` and its affected-row count.
  - Each client attaches an `'error'` listener, since an unhandled driver `'error'` event crashes the main process.
- The renderer reaches the database only through typed methods on `window.api` (`ipcMain.handle` / `ipcRenderer.invoke`, channels like `db:query`). New features should not use the raw `window.electron.ipcRenderer`.
- Saved connections in a SQLite file under `app.getPath('userData')`; passwords encrypted with `safeStorage`.
- No router: `App` shows a connect screen or the workspace based on state, and open tabs live in a Zustand store. If a router is ever added, use `HashRouter` or `MemoryRouter`, since the packaged app loads from `file://`.
- UI libraries (installed, not used yet): Zustand, AG Grid Community, CodeMirror 6 (`@uiw/react-codemirror`), Tailwind CSS v4. Tailwind is wired in through `@tailwindcss/vite` and `@import 'tailwindcss'` in `src/renderer/src/assets/main.css`; keep any other CSS inside `@layer`, since unlayered rules override Tailwind utilities.

## pnpm and native modules

- pnpm 11 only reads auth/registry settings from `.npmrc`; other pnpm settings go in `pnpm-workspace.yaml`.
- `pnpm-workspace.yaml` sets `nodeLinker: hoisted` (flat `node_modules`, which electron-builder and native-module rebuilds expect). Changing it requires deleting `node_modules` and running `pnpm install` again.
- Dependencies with install scripts must be listed under `allowBuilds` in `pnpm-workspace.yaml`, or `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS` (e.g. add `better-sqlite3: true` when adding it).
- `postinstall` runs `install-electron` (downloads the Electron binary) and `electron-builder install-app-deps` (rebuilds native modules for Electron's Node ABI). `electron-builder.yml` sets `npmRebuild: false`, so packaging relies on that postinstall rebuild; on a `NODE_MODULE_VERSION` error run `pnpm exec electron-builder install-app-deps`.
- Do not read `.npmrc`: a user hook blocks any Bash command that mentions it, because it can hold auth tokens. It is gitignored.

## Template placeholders still to replace

`appId: com.electron.app` and `publish.url` (example.com) in `electron-builder.yml`, `setAppUserModelId('com.electron')` in `src/main/index.ts`, `author`/`homepage` in `package.json`, the `<title>` in `src/renderer/index.html`, and the template's demo UI (`App.tsx`, `components/Versions.tsx`, `assets/electron.svg`, the `ping` IPC handler in `src/main/ipc.ts`). The demo's CSS is already gone, so it renders unstyled until step 8 replaces it.

## Beekeeper Studio reference and licensing

A clone of Beekeeper Studio lives at `~/projects/beekeeper-studio` for reference.

- Never copy code from its `apps/studio/src-commercial/` (commercial license).
- Its other code is GPLv3; porting it makes Trowel a derivative that must be GPLv3 when distributed. Ask the user before porting any of its code.
- Don't use the Beekeeper Studio name or logo.

## Code style

- Prettier: single quotes, no semicolons, 100-column lines, no trailing commas; 2-space indent.
- ESLint (`@electron-toolkit/eslint-config-ts`) requires explicit return types on functions in `.ts`/`.tsx` (typed expressions and callbacks are exempt), forbids `any`, and only allows `@ts-ignore` with a description. React hooks and react-refresh rules are on.
