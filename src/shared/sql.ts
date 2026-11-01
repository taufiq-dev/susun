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

// The table tab's filter: one condition on one column.
export const FILTER_OPERATORS = [
  '=',
  '<>',
  '<',
  '>',
  '<=',
  '>=',
  'contains',
  'starts with',
  'is null',
  'is not null'
] as const

export type FilterOperator = (typeof FILTER_OPERATORS)[number]

export interface Filter {
  column: string
  operator: FilterOperator
  // Unused by `is null` and `is not null`.
  value: string
}

export function takesValue(operator: FilterOperator): boolean {
  return operator !== 'is null' && operator !== 'is not null'
}

export interface Order {
  column: string
  direction: 'asc' | 'desc'
}

// A statement and its parameters, in placeholder order.
export interface Parameterized {
  sql: string
  params: unknown[]
}

// Numbers placeholders as they're used: `$1, $2` on Postgres, `?` on MySQL and SQLite.
function placeholders(type: DbType): () => string {
  let n = 0
  return () => (type === 'postgres' ? `$${++n}` : '?')
}

// A column as text, so `contains` works on numbers and dates too.
function asText(type: DbType, column: string): string {
  if (type === 'postgres') return `${column}::text`
  return type === 'mysql' ? `cast(${column} as char)` : `cast(${column} as text)`
}

// `%` and `_` in a LIKE pattern match literally, escaped with `!` (the same escape on every
// database; a backslash means something else in a MySQL string).
function likeLiteral(value: string): string {
  return value.replace(/[!%_]/g, '!$&')
}

function condition(type: DbType, filter: Filter, next: () => string, params: unknown[]): string {
  const column = quoteIdent(type, filter.column)
  switch (filter.operator) {
    case 'is null':
    case 'is not null':
      return `${column} ${filter.operator}`
    case 'contains':
    case 'starts with': {
      const pattern = `${filter.operator === 'contains' ? '%' : ''}${likeLiteral(filter.value)}%`
      params.push(pattern)
      // Case-insensitive everywhere: MySQL's and SQLite's LIKE already are, Postgres's isn't.
      const like = type === 'postgres' ? 'ilike' : 'like'
      return `${asText(type, column)} ${like} ${next()} escape '!'`
    }
    default:
      params.push(filter.value)
      return `${column} ${filter.operator} ${next()}`
  }
}

function whereClause(
  type: DbType,
  filter: Filter | undefined,
  next: () => string,
  params: unknown[]
): string {
  return filter ? ` where ${condition(type, filter, next, params)}` : ''
}

// One page of a table's rows, filtered and in order.
export function selectPageSql(
  type: DbType,
  table: TableRef,
  page: { filter?: Filter; order: Order[]; limit: number; offset: number }
): Parameterized {
  const params: unknown[] = []
  const where = whereClause(type, page.filter, placeholders(type), params)
  const order = page.order.length
    ? ` order by ${page.order.map((o) => `${quoteIdent(type, o.column)} ${o.direction}`).join(', ')}`
    : ''
  const sql = `select * from ${qualifiedName(type, table)}${where}${order} limit ${page.limit} offset ${page.offset}`
  return { sql, params }
}

export function countSql(type: DbType, table: TableRef, filter?: Filter): Parameterized {
  const params: unknown[] = []
  const where = whereClause(type, filter, placeholders(type), params)
  return { sql: `select count(*) from ${qualifiedName(type, table)}${where}`, params }
}

// Changes one row, found by its primary key.
export function updateRowSql(
  type: DbType,
  table: TableRef,
  changes: { column: string; value: unknown }[],
  key: { column: string; value: unknown }[]
): Parameterized {
  const next = placeholders(type)
  const params: unknown[] = []
  const set = changes.map((c) => {
    params.push(c.value)
    return `${quoteIdent(type, c.column)} = ${next()}`
  })
  const where = key.map((k) => {
    params.push(k.value)
    return `${quoteIdent(type, k.column)} = ${next()}`
  })
  return {
    sql: `update ${qualifiedName(type, table)} set ${set.join(', ')} where ${where.join(' and ')}`,
    params
  }
}
