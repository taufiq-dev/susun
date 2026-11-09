// susun.db in the app's userData folder: saved connections (connections.ts), settings
// (settings.ts), and each connection's query files and history (library.ts). better-sqlite3 is synchronous, which is fine for tables this small.
import { join } from 'path'
import Database from 'better-sqlite3'
import { app } from 'electron'

// One entry per schema version, applied in order and tracked in `pragma user_version`. Append new
// ones; never edit one that has shipped.
const MIGRATIONS = [
  `create table connections (
    id text primary key,
    name text not null,
    config text not null, -- ConnectionConfig as JSON, without the password
    password blob -- encrypted with safeStorage; null when there is none
  )`,
  `create table settings (
    key text primary key, -- a key of Settings in src/shared/types.ts
    value text not null -- its value as JSON
  )`,
  `alter table connections add column last_used integer; -- ms since the epoch
  create table query_files ( -- .sql files saved or opened while connected (library.ts)
    connection text not null, -- connectionKey() in library.ts
    path text not null,
    used_at integer not null,
    primary key (connection, path)
  );
  create table query_history ( -- each run of a query tab (library.ts)
    id integer primary key,
    connection text not null, -- connectionKey() in library.ts
    sql text not null,
    ran_at integer not null,
    duration_ms real not null,
    status text not null, -- done, failed or cancelled
    summary text not null
  );
  create index query_history_by_connection on query_history (connection, id);`
]

let db: Database.Database | undefined

export function store(): Database.Database {
  if (db) return db
  const opened = new Database(join(app.getPath('userData'), 'susun.db'))
  const version = opened.pragma('user_version', { simple: true }) as number
  for (let v = version; v < MIGRATIONS.length; v++) {
    opened.transaction(() => {
      opened.exec(MIGRATIONS[v])
      opened.pragma(`user_version = ${v + 1}`)
    })()
  }
  db = opened
  return db
}
