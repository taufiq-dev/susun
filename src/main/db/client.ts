import type { ColumnInfo, QueryResult, TableInfo, TableRef } from '@shared/types'

// One open connection to one database. Each implementation holds a single driver connection, so
// calls run one at a time and a transaction spans calls.
export interface DbClient {
  connect(): Promise<void>
  disconnect(): Promise<void>
  listTables(): Promise<TableInfo[]>
  listColumns(table: TableRef): Promise<ColumnInfo[]>
  // Placeholders are `$1, $2` on Postgres and `?` on MySQL and SQLite.
  query(sql: string, params?: unknown[]): Promise<QueryResult>
}
