import type { DbType, TableInfo, TableRef } from './types'

// A name as an identifier: in double quotes (Postgres, SQLite) or backticks (MySQL), with the quote
// character doubled inside, so any name works, keywords and odd characters included.
export function quoteIdent(type: DbType, name: string): string {
  const q = type === 'mysql' ? '`' : '"'
  return q + name.replaceAll(q, q + q) + q
}

// The table as SQL names it: `schema.table` when it has a schema (Postgres), else `table`.
export function qualifiedName(type: DbType, table: TableRef): string {
  const name = quoteIdent(type, table.name)
  return table.schema ? `${quoteIdent(type, table.schema)}.${name}` : name
}

// How many rows "Select top" and "View data" ask for.
export const SELECT_TOP_ROWS = 100

export function selectTopSql(type: DbType, table: TableRef): string {
  return `select * from ${qualifiedName(type, table)} limit ${SELECT_TOP_ROWS};`
}

export function dropSql(type: DbType, table: TableInfo): string {
  return `drop ${table.type === 'view' ? 'view' : 'table'} ${qualifiedName(type, table)};`
}

// Empties a table. SQLite has no TRUNCATE; a DELETE without WHERE does the same there.
export function truncateSql(type: DbType, table: TableRef): string {
  const name = qualifiedName(type, table)
  return type === 'sqlite' ? `delete from ${name};` : `truncate table ${name};`
}
