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
}

export interface DbApi {
  // Opens a connection and returns its id. Closing or reloading the window closes it.
  connect(config: ConnectionConfig): Promise<string>
  disconnect(connectionId: string): Promise<void>
  listTables(connectionId: string): Promise<TableInfo[]>
  listColumns(connectionId: string, table: TableRef): Promise<ColumnInfo[]>
  query(connectionId: string, sql: string, params?: unknown[]): Promise<QueryResult>
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

// How a handler's outcome crosses IPC. An error thrown in a handler would reach the renderer
// prefixed with "Error invoking remote method 'db:query': Error: ", so handlers return this
// instead and preload throws `message` as a plain Error.
export type IpcResult<T> = { ok: true; value: T } | { ok: false; message: string }
