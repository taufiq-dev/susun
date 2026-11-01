import type {
  ColumnInfo,
  ConnectionConfig,
  QueryResult,
  SavedConnection,
  SavedConnectionInput,
  TableInfo,
  TableRef
} from './types'

// What preload exposes as `window.api`. Each method is an `ipcMain.handle` channel named
// `<group>:<method>`, so `api.db.query` is `db:query`.
export interface Api {
  db: DbApi
  connections: ConnectionsApi
  dialog: DialogApi
}

// A connection has its own session, which calls given the connection id run on, and can open more.
// A session is one database connection (on SQLite, one process), so the queries of different
// sessions run side by side, and each has its own transactions, temp tables and settings.
export interface DbApi {
  // Opens a connection and returns its id. Closing or reloading the window closes it.
  connect(config: ConnectionConfig): Promise<string>
  // Closes the connection and its sessions.
  disconnect(connectionId: string): Promise<void>
  // Opens another session on the connection and returns its id. Each query tab has one. An
  // in-memory SQLite database exists only in the connection's own session, so for one this
  // returns the connection id.
  openSession(connectionId: string): Promise<string>
  // Closes a session from `openSession`, stopping its running query. Does nothing for a connection
  // id or a session already closed.
  closeSession(sessionId: string): Promise<void>
  listTables(connectionId: string): Promise<TableInfo[]>
  listColumns(connectionId: string, table: TableRef): Promise<ColumnInfo[]>
  // `sessionId` is from `openSession`, or a connection id for the connection's own session.
  query(sessionId: string, sql: string, params?: unknown[]): Promise<QueryResult>
  // Stops the query running in the session, which then rejects. Does nothing if none is running or
  // the session is closed. On SQLite this reopens the database, which loses the session's state
  // (an open transaction, temp tables, attached databases, settings).
  cancel(sessionId: string): Promise<void>
}

// Saved connections. These are stored configs, not open connections: pass one's `config` to
// `db.connect` to open it.
export interface ConnectionsApi {
  // Sorted by name, with passwords decrypted.
  list(): Promise<SavedConnection[]>
  save(connection: SavedConnectionInput): Promise<SavedConnection>
  // Does nothing if no saved connection has that id.
  remove(id: string): Promise<void>
}

export interface DialogApi {
  // Asks the user to pick a SQLite database file. Resolves to its path, or null if cancelled.
  openSqliteFile(): Promise<string | null>
}

// How a handler's outcome crosses IPC. An error thrown in a handler would reach the renderer
// prefixed with "Error invoking remote method 'db:query': Error: ", so handlers return this
// instead and preload throws `message` as a plain Error.
export type IpcResult<T> = { ok: true; value: T } | { ok: false; message: string }
