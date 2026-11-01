// trowel.db in the app's userData folder: saved connections (connections.ts) and settings
// (settings.ts). better-sqlite3 is synchronous, which is fine for tables this small.
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
  )`
]

let db: Database.Database | undefined

export function store(): Database.Database {
  if (db) return db
  const opened = new Database(join(app.getPath('userData'), 'trowel.db'))
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
