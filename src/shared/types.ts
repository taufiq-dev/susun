// Types shared by the main process, preload and renderer. Keep this folder free of Node, Electron
// and DOM APIs, since it is compiled for both sides.

export const DB_TYPES = ['postgres', 'mysql', 'sqlite'] as const

export type DbType = (typeof DB_TYPES)[number]

export interface ServerConnectionConfig {
  type: 'postgres' | 'mysql'
  host: string
  port: number
  user: string
  password: string
  // Empty means the server default: the user's own database on Postgres, none on MySQL.
  database: string
}

export interface SqliteConnectionConfig {
  type: 'sqlite'
  file: string
}

export type ConnectionConfig = ServerConnectionConfig | SqliteConnectionConfig

// A connection saved on the connect screen. Its password is stored encrypted and comes back
// decrypted in `config`.
export interface SavedConnection {
  id: string
  name: string
  config: ConnectionConfig
}

// What `api.connections.save` takes: without an `id` it adds a connection, with one it replaces
// that saved connection.
export type SavedConnectionInput = Omit<SavedConnection, 'id'> & { id?: string }

// `schema` is the Postgres schema. MySQL (one database per connection) and SQLite leave it unset.
export interface TableRef {
  schema?: string
  name: string
}

export interface TableInfo extends TableRef {
  type: 'table' | 'view'
}

export interface ColumnInfo {
  name: string
  // As the database declares it, e.g. `character varying(255)`, `int unsigned`, `TEXT`.
  dataType: string
  nullable: boolean
  // The default as the database reports it (an expression or a literal, quoting varies by
  // database), or null if there is none.
  defaultValue: string | null
  primaryKey: boolean
}

// Rows are arrays in `columns` order, so duplicate column names (`select a.id, b.id`) survive.
// Integers too large for a JS number arrive as strings. Statements that return no rows have empty
// `columns` and `rows`, and `rowCount` is the number of rows they changed.
export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  durationMs: number
}
