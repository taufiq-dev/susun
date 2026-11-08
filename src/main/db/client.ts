import type { ColumnInfo, ForeignKeyInfo, QueryResult, TableInfo, TableRef } from '@shared/types'

// One open connection to one database. Each implementation holds a single driver connection, so
// calls run one at a time and a transaction spans calls.
export interface DbClient {
  connect(): Promise<void>
  // Also stops a running query.
  disconnect(): Promise<void>
  listTables(): Promise<TableInfo[]>
  listColumns(table: TableRef): Promise<ColumnInfo[]>
  // The columns of each table, in the order given; a table that isn't there has none. One query
  // for them all, where `listColumns` would take a round trip each.
  listColumnsOf(tables: TableRef[]): Promise<ColumnInfo[][]>
  // Every foreign key in the database (on Postgres, in every schema but the system's), by table.
  listForeignKeys(): Promise<ForeignKeyInfo[]>
  // Placeholders are `$1, $2` on Postgres and `?` on MySQL and SQLite.
  query(sql: string, params?: unknown[]): Promise<QueryResult>
  // Stops the query running on this connection, which then rejects. Does nothing if no query is
  // running.
  cancel(): Promise<void>
  // Calls `listener` when the connection ends without `disconnect`: the server closed it, the
  // network dropped it, or on SQLite its process died. From then on every call rejects, and this
  // is called before a call in progress rejects. It can be called more than once; the first call
  // says why. A lost client stays lost, so carrying on takes a new one (see ReconnectingClient).
  onLost(listener: (reason: string) => void): void
}
