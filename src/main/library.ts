// Each connection's query library: the .sql files saved or opened while connected to it, and the
// history of its runs. Both are in susun.db (store.ts), filed under the connection's key.
import { stat } from 'fs/promises'
import type { ConnectionConfig, HistoryEntry, NewHistoryEntry, QueryFileEntry } from '@shared/types'
import { store } from './store'

// The most runs kept per connection; older ones are dropped.
const HISTORY_LIMIT = 1000

// What files and history are filed under: the saved connection, so they survive editing its
// address; or, for a connection that isn't saved, its address.
export function connectionKey(config: ConnectionConfig, savedId?: string): string {
  if (savedId) return `saved:${savedId}`
  if (config.type === 'sqlite') return `sqlite:${config.file}`
  const database = config.database || '-'
  return `${config.type}:${config.user}@${config.host}:${config.port}/${database}`
}

export function rememberFile(key: string, path: string): void {
  store()
    .prepare(
      `insert into query_files (connection, path, used_at) values (?, ?, ?)
       on conflict (connection, path) do update set used_at = excluded.used_at`
    )
    .run(key, path, Date.now())
}

export function hasFile(key: string, path: string): boolean {
  return !!store()
    .prepare('select 1 from query_files where connection = ? and path = ?')
    .get(key, path)
}

export function forgetFile(key: string, path: string): void {
  store().prepare('delete from query_files where connection = ? and path = ?').run(key, path)
}

// Newest first, each checked for still being there.
export async function listFiles(key: string): Promise<QueryFileEntry[]> {
  const rows = store()
    .prepare(
      'select path, used_at as usedAt from query_files where connection = ? order by used_at desc'
    )
    .all(key) as { path: string; usedAt: number }[]
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      missing: await stat(row.path).then(
        (s) => !s.isFile(),
        () => true
      )
    }))
  )
}

export function addHistory(key: string, entry: NewHistoryEntry): void {
  const db = store()
  db.transaction(() => {
    db.prepare(
      `insert into query_history (connection, sql, ran_at, duration_ms, status, summary)
       values (?, ?, ?, ?, ?, ?)`
    ).run(key, entry.sql, Date.now(), entry.durationMs, entry.status, entry.summary)
    db.prepare(
      `delete from query_history where connection = ? and id not in
         (select id from query_history where connection = ? order by id desc limit ?)`
    ).run(key, key, HISTORY_LIMIT)
  })()
}

// Newest first.
export function listHistory(key: string): HistoryEntry[] {
  return store()
    .prepare(
      `select id, sql, ran_at as ranAt, duration_ms as durationMs, status, summary
       from query_history where connection = ? order by id desc`
    )
    .all(key) as HistoryEntry[]
}

export function clearHistory(key: string): void {
  store().prepare('delete from query_history where connection = ?').run(key)
}

// A saved connection was deleted: its files list and history go too.
export function forgetSavedConnection(id: string): void {
  const key = `saved:${id}`
  store().prepare('delete from query_files where connection = ?').run(key)
  store().prepare('delete from query_history where connection = ?').run(key)
}
