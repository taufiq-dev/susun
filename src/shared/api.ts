import type { ColumnInfo, ConnectionConfig, QueryResult, TableInfo, TableRef } from './types'

// What preload exposes as `window.api`. Each method is an `ipcMain.handle` channel named
// `<group>:<method>`, so `api.db.query` is `db:query`.
export interface Api {
  db: DbApi
}

export interface DbApi {
  // Opens a connection and returns its id. Closing or reloading the window closes it.
  connect(config: ConnectionConfig): Promise<string>
  disconnect(connectionId: string): Promise<void>
  listTables(connectionId: string): Promise<TableInfo[]>
  listColumns(connectionId: string, table: TableRef): Promise<ColumnInfo[]>
  query(connectionId: string, sql: string, params?: unknown[]): Promise<QueryResult>
}

// How a handler's outcome crosses IPC. An error thrown in a handler would reach the renderer
// prefixed with "Error invoking remote method 'db:query': Error: ", so handlers return this
// instead and preload throws `message` as a plain Error.
export type IpcResult<T> = { ok: true; value: T } | { ok: false; message: string }
