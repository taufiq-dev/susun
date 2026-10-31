// Runs one SQLite connection in its own Electron utility process, because better-sqlite3 is
// synchronous and would block the main process for the length of every query, and because killing
// a process is the only way to stop a query running inside SQLite. `SqliteClient` in sqlite.ts is
// the other end: it posts `{ id, method, args }` and gets back `{ id, ok, value }` or
// `{ id, ok, message }`.
import Database from 'better-sqlite3'
import type { ColumnInfo, QueryResult, TableInfo, TableRef } from '@shared/types'

const LIST_TABLES = `
  select name, type from sqlite_schema
  where type in ('table', 'view') and name not like 'sqlite\\_%' escape '\\'
  order by name`

let db: Database.Database | undefined

function database(): Database.Database {
  if (!db) throw new Error('Not connected')
  return db
}

const methods = {
  open(file: string): void {
    // Opening a path that doesn't exist would silently create an empty database.
    db = new Database(file, { fileMustExist: true })
  },

  close(): void {
    db?.close()
    db = undefined
  },

  listTables(): TableInfo[] {
    const rows = database().prepare(LIST_TABLES).all() as { name: string; type: string }[]
    return rows.map((r) => ({ name: r.name, type: r.type === 'view' ? 'view' : 'table' }))
  },

  listColumns(table: TableRef): ColumnInfo[] {
    const rows = database()
      .prepare('select * from pragma_table_info(?, ?)')
      .all(table.name, table.schema ?? 'main') as {
      name: string
      type: string
      notnull: number
      dflt_value: string | null
      pk: number
    }[]
    return rows.map((r) => ({
      name: r.name,
      dataType: r.type,
      nullable: r.notnull === 0,
      defaultValue: r.dflt_value,
      primaryKey: r.pk > 0
    }))
  },

  query(sql: string, params: unknown[] = []): QueryResult {
    const start = performance.now()
    const stmt = database().prepare(sql)
    if (!stmt.reader) {
      const { changes } = stmt.run(...params)
      return { columns: [], rows: [], rowCount: changes, durationMs: performance.now() - start }
    }
    // safeIntegers returns every integer as a bigint; turn them back into numbers unless that
    // would lose precision, as the MySQL client does.
    const raw = stmt
      .raw(true)
      .safeIntegers(true)
      .all(...params) as unknown[][]
    const durationMs = performance.now() - start
    const rows = raw.map((row) => row.map(toSafeValue))
    return { columns: stmt.columns().map((c) => c.name), rows, rowCount: rows.length, durationMs }
  }
}

export type SqliteMethods = typeof methods

function toSafeValue(value: unknown): unknown {
  if (typeof value !== 'bigint') return value
  const fits = value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER
  return fits ? Number(value) : value.toString()
}

export interface SqliteRequest {
  id: number
  method: keyof SqliteMethods
  args: unknown[]
}

export type SqliteResponse =
  { id: number; ok: true; value: unknown } | { id: number; ok: false; message: string }

function reply(response: SqliteResponse): void {
  process.parentPort.postMessage(response)
}

process.parentPort.on('message', ({ data }) => {
  const { id, method, args } = data as SqliteRequest
  try {
    const value = (methods[method] as (...a: unknown[]) => unknown)(...args)
    reply({ id, ok: true, value })
  } catch (err) {
    reply({ id, ok: false, message: (err as Error).message })
  }
})
