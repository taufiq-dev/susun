// Runs one SQLite connection in its own Electron utility process, because better-sqlite3 is
// synchronous and would block the main process for the length of every query, and because killing
// a process is the only way to stop a query running inside SQLite. `SqliteClient` in sqlite.ts is
// the other end: it posts `{ id, method, args }` and gets back `{ id, ok, value }` or
// `{ id, ok, message }`.
import Database from 'better-sqlite3'
import {
  ROW_LIMIT,
  type ColumnInfo,
  type ForeignKeyInfo,
  type QueryResult,
  type TableInfo,
  type TableRef
} from '@shared/types'
import { stopsAtLimit } from './limit'

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

  listColumnsOf(tables: TableRef[]): ColumnInfo[][] {
    return tables.map((t) => methods.listColumns(t))
  },

  // pragma_foreign_key_list gives a row per column of each key (`id`), in order (`seq`). A key
  // naming no columns of the table it refers to (`to` is null) refers to its primary key. The
  // table it refers to is named as written, which may differ in case from the table's name.
  listForeignKeys(): ForeignKeyInfo[] {
    const tables = methods.listTables().filter((t) => t.type === 'table')
    const named = new Map(tables.map((t) => [t.name.toLowerCase(), t.name]))
    const keys: ForeignKeyInfo[] = []
    for (const table of tables) {
      const rows = database()
        .prepare('select * from pragma_foreign_key_list(?) order by id, seq')
        .all(table.name) as {
        id: number
        table: string
        from: string
        to: string | null
        on_update: string
        on_delete: string
      }[]
      const byId = Map.groupBy(rows, (r) => r.id)
      for (const key of byId.values()) {
        const first = key[0]
        const references = named.get(first.table.toLowerCase()) ?? first.table
        const referencedColumns = key.every((r) => r.to !== null)
          ? key.map((r) => r.to as string)
          : (
              database()
                .prepare('select name from pragma_table_info(?) where pk > 0 order by pk')
                .all(references) as { name: string }[]
            ).map((c) => c.name)
        keys.push({
          name: null,
          table: { name: table.name },
          columns: key.map((r) => r.from),
          references: { name: references },
          referencedColumns,
          onUpdate: first.on_update,
          onDelete: first.on_delete
        })
      }
    }
    return keys
  },

  query(sql: string, params: unknown[] = []): QueryResult {
    const start = performance.now()
    const stmt = database().prepare(sql)
    if (!stmt.reader) {
      const { changes } = stmt.run(...params)
      return { columns: [], rows: [], rowCount: changes, durationMs: performance.now() - start }
    }
    const columns = stmt.columns().map((c) => c.name)
    // safeIntegers returns every integer as a bigint; turn them back into numbers unless that
    // would lose precision, as the MySQL client does.
    const results = stmt
      .raw(true)
      .safeIntegers(true)
      .iterate(...params) as Iterable<unknown[]>
    // Stepping stops at the limit, and so does SQLite's work on the query, unless it has already
    // finished (see stopsAtLimit).
    const rows: unknown[][] = []
    let truncated = false
    for (const row of results) {
      if (rows.length === ROW_LIMIT) {
        truncated = true
        break
      }
      rows.push(row.map(toSafeValue))
    }
    const durationMs = performance.now() - start
    return {
      columns,
      rows,
      rowCount: truncated ? null : rows.length,
      truncated,
      stopped: truncated && stopsAtLimit(sql),
      durationMs
    }
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
