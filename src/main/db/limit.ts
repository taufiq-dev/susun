// Leading whitespace, comments and opening parentheses, then the first word.
export const FIRST_WORD = /^(?:\s|\(|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*([a-z]+)/i
// A subquery that changes data, as in `with d as (delete from t returning *) select ...`.
const CHANGING_SUBQUERY = /\((?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*(?:insert|update|delete|merge)\b/i

// Whether a statement stops running when Postgres or SQLite stops reading its rows at the row
// limit. A query (SELECT, VALUES, TABLE, WITH ... SELECT) does: the rows it never produced are
// never worked out, so functions it calls run only for the rows read. An INSERT, UPDATE, DELETE
// or MERGE ... RETURNING, a WITH whose subqueries change data, and Postgres commands such as
// EXPLAIN, SHOW and FETCH run to the end before returning their first row.
export function stopsAtLimit(sql: string): boolean {
  const first = FIRST_WORD.exec(sql)?.[1].toLowerCase()
  if (first === 'with') return !CHANGING_SUBQUERY.test(sql)
  return first === 'select' || first === 'values' || first === 'table'
}
