import Database from 'better-sqlite3'
import type {
  ColumnInfo,
  QueryResult,
  SqliteConnectionConfig,
  TableInfo,
  TableRef
} from '@shared/types'
import type { DbClient } from './client'

const LIST_TABLES = `
  select name, type from sqlite_schema
  where type in ('table', 'view') and name not like 'sqlite\\_%' escape '\\'
  order by name`

// better-sqlite3 is synchronous: a long query blocks the main process until it finishes.
export class SqliteClient implements DbClient {
  private config: SqliteConnectionConfig
  private db?: Database.Database

  constructor(config: SqliteConnectionConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    // Opening a path that doesn't exist would silently create an empty database.
    this.db = new Database(this.config.file, { fileMustExist: true })
  }

  async disconnect(): Promise<void> {
    this.db?.close()
    this.db = undefined
  }

  async listTables(): Promise<TableInfo[]> {
    const rows = this.database().prepare(LIST_TABLES).all() as { name: string; type: string }[]
    return rows.map((r) => ({ name: r.name, type: r.type === 'view' ? 'view' : 'table' }))
  }

  async listColumns(table: TableRef): Promise<ColumnInfo[]> {
    const rows = this.database()
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
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const start = performance.now()
    const stmt = this.database().prepare(sql)
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

  private database(): Database.Database {
    if (!this.db) throw new Error('Not connected')
    return this.db
  }
}

function toSafeValue(value: unknown): unknown {
  if (typeof value !== 'bigint') return value
  const fits = value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER
  return fits ? Number(value) : value.toString()
}
