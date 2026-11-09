// Types shared by the main process, preload and renderer. Keep this folder free of Node, Electron
// and DOM APIs, since it is compiled for both sides.

export const DB_TYPES = ['postgres', 'mysql', 'sqlite'] as const

export type DbType = (typeof DB_TYPES)[number]

// TLS for Postgres and MySQL. 'require' encrypts but accepts any certificate (Postgres's
// sslmode=require); 'verify' also checks the certificate chain against the trusted CAs and the
// host name against the certificate (sslmode=verify-full).
export const SSL_MODES = ['off', 'require', 'verify'] as const

export type SslMode = (typeof SSL_MODES)[number]

export interface ServerConnectionConfig {
  type: 'postgres' | 'mysql'
  host: string
  port: number
  user: string
  password: string
  // Empty means the server default: the user's own database on Postgres, none on MySQL.
  database: string
  ssl: SslMode
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
  // When it was last connected to, in ms since the epoch, if ever.
  lastUsedAt?: number
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

// A foreign key: `columns` of `table` refer to `referencedColumns` of `references`, pairwise in
// order. A key of several columns lists them all.
export interface ForeignKeyInfo {
  // The constraint's name. SQLite's foreign keys have none.
  name: string | null
  table: TableRef
  columns: string[]
  references: TableRef
  referencedColumns: string[]
  // What happens to the row when the referenced row is updated or deleted, as the database words
  // it, e.g. `CASCADE`, `SET NULL`, `NO ACTION`.
  onUpdate: string
  onDelete: string
}

// The most rows a query result keeps, so a large result can't fill the app's memory.
export const ROW_LIMIT = 10_000

// Rows are arrays in `columns` order, so duplicate column names (`select a.id, b.id`) survive.
// Integers too large for a JS number arrive as strings. Statements that return no rows have empty
// `columns` and `rows`, and `rowCount` is the number of rows they changed.
//
// A statement that returns more than ROW_LIMIT rows keeps the first ROW_LIMIT, with `truncated`
// set. Its `rowCount` is then how many it returned in all if the driver read every row anyway
// (MySQL), or null if it stopped reading (Postgres, SQLite). `stopped` says whether the statement
// stopped running there too: a SELECT does, so it never worked out later rows nor called
// functions for them, while an INSERT, UPDATE or DELETE ... RETURNING has made all its changes.
export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number | null
  truncated?: boolean
  stopped?: boolean
  durationMs: number
}

// The app's settings, kept in susun.db and changed in the Settings window.
export interface Settings {
  // Before a query tab with unsaved SQL closes (on its own, or when disconnecting, closing the
  // window or quitting), ask whether to save it. The prompt's "Don't ask again" turns this off.
  askToSaveQueries: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  askToSaveQueries: true
}

// A run in a connection's history: the SQL run (the selection, or the whole editor) and how it went.
export interface HistoryEntry {
  id: number
  sql: string
  // When it ran, in ms since the epoch.
  ranAt: number
  durationMs: number
  status: 'done' | 'failed' | 'cancelled'
  // e.g. "40 rows", "3 statements", or the error.
  summary: string
}

export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'ranAt'>

// A .sql file saved or opened while connected to a connection.
export interface QueryFileEntry {
  path: string
  // When it was last saved or opened, in ms since the epoch.
  usedAt: number
  // It's no longer there (moved, renamed or deleted).
  missing: boolean
}
