import type { ColumnInfo, QueryResult, TableInfo, TableRef } from '@shared/types'

// One open connection to one database. Each implementation holds a single driver connection, so
// calls run one at a time and a transaction spans calls.
export interface DbClient {
  connect(): Promise<void>
  // Also stops a running query.
  disconnect(): Promise<void>
  listTables(): Promise<TableInfo[]>
  listColumns(table: TableRef): Promise<ColumnInfo[]>
  // Placeholders are `$1, $2` on Postgres and `?` on MySQL and SQLite.
  query(sql: string, params?: unknown[]): Promise<QueryResult>
  // Stops the query running on this connection, which then rejects. Does nothing if no query is
  // running.
  cancel(): Promise<void>
}
