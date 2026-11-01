import { describe, expect, it } from 'vitest'
import {
  countSql,
  dropSql,
  qualifiedName,
  quoteIdent,
  selectPageSql,
  selectTopSql,
  truncateSql,
  updateRowSql
} from './sql'

describe('quoteIdent', () => {
  it('quotes in each database’s style', () => {
    expect(quoteIdent('postgres', 'orders')).toBe('"orders"')
    expect(quoteIdent('sqlite', 'orders')).toBe('"orders"')
    expect(quoteIdent('mysql', 'orders')).toBe('`orders`')
  })

  it('doubles the quote character inside a name', () => {
    expect(quoteIdent('postgres', 'a"b')).toBe('"a""b"')
    expect(quoteIdent('mysql', 'a`b')).toBe('`a``b`')
    // The other style's quote needs nothing.
    expect(quoteIdent('mysql', 'a"b')).toBe('`a"b`')
  })

  it('keeps keywords, spaces and case as they are', () => {
    expect(quoteIdent('postgres', 'Order Items')).toBe('"Order Items"')
    expect(quoteIdent('postgres', 'select')).toBe('"select"')
  })
})

describe('statements', () => {
  const orders = { schema: 'shop', name: 'orders', type: 'table' as const }
  const recent = { name: 'recent', type: 'view' as const }

  it('qualifies a name with its schema', () => {
    expect(qualifiedName('postgres', orders)).toBe('"shop"."orders"')
    expect(qualifiedName('sqlite', recent)).toBe('"recent"')
  })

  it('selects the first rows', () => {
    expect(selectTopSql('mysql', { name: 'orders' })).toBe('select * from `orders` limit 100;')
  })

  it('drops a table or a view', () => {
    expect(dropSql('postgres', orders)).toBe('drop table "shop"."orders";')
    expect(dropSql('sqlite', recent)).toBe('drop view "recent";')
  })

  it('truncates, or on SQLite deletes every row', () => {
    expect(truncateSql('postgres', orders)).toBe('truncate table "shop"."orders";')
    expect(truncateSql('mysql', { name: 'orders' })).toBe('truncate table `orders`;')
    expect(truncateSql('sqlite', { name: 'orders' })).toBe('delete from "orders";')
  })
})

describe('table tab statements', () => {
  const orders = { schema: 'shop', name: 'orders' }

  it('selects a page in order', () => {
    expect(
      selectPageSql('postgres', orders, {
        order: [{ column: 'id', direction: 'asc' }],
        limit: 101,
        offset: 200
      })
    ).toEqual({
      sql: 'select * from "shop"."orders" order by "id" asc limit 101 offset 200',
      params: []
    })
  })

  it('filters with a parameter, numbered on Postgres', () => {
    const page = {
      filter: { column: 'total', operator: '>' as const, value: '10' },
      order: [],
      limit: 101,
      offset: 0
    }
    expect(selectPageSql('postgres', orders, page)).toEqual({
      sql: 'select * from "shop"."orders" where "total" > $1 limit 101 offset 0',
      params: ['10']
    })
    expect(selectPageSql('mysql', { name: 'orders' }, page).sql).toBe(
      'select * from `orders` where `total` > ? limit 101 offset 0'
    )
  })

  it('matches contains and starts with as text, case-insensitively, with % and _ literal', () => {
    const contains = { column: 'note', operator: 'contains' as const, value: '50%_off!' }
    expect(countSql('postgres', orders, contains)).toEqual({
      sql: `select count(*) from "shop"."orders" where "note"::text ilike $1 escape '!'`,
      params: ['%50!%!_off!!%']
    })
    expect(countSql('mysql', { name: 'o' }, { ...contains, operator: 'starts with' })).toEqual({
      sql: "select count(*) from `o` where cast(`note` as char) like ? escape '!'",
      params: ['50!%!_off!!%']
    })
    expect(countSql('sqlite', { name: 'o' }, contains).sql).toBe(
      `select count(*) from "o" where cast("note" as text) like ? escape '!'`
    )
  })

  it('tests for NULL without a parameter', () => {
    expect(
      countSql('sqlite', { name: 'o' }, { column: 'note', operator: 'is null', value: '' })
    ).toEqual({
      sql: 'select count(*) from "o" where "note" is null',
      params: []
    })
  })

  it('updates a row by its key, with the values as parameters', () => {
    expect(
      updateRowSql(
        'postgres',
        orders,
        [
          { column: 'note', value: 'gift' },
          { column: 'total', value: null }
        ],
        [
          { column: 'id', value: 7 },
          { column: 'line', value: '2' }
        ]
      )
    ).toEqual({
      sql: 'update "shop"."orders" set "note" = $1, "total" = $2 where "id" = $3 and "line" = $4',
      params: ['gift', null, 7, '2']
    })
    expect(
      updateRowSql(
        'mysql',
        { name: 'o' },
        [{ column: 'a', value: 1 }],
        [{ column: 'id', value: 2 }]
      ).sql
    ).toBe('update `o` set `a` = ? where `id` = ?')
  })
})
