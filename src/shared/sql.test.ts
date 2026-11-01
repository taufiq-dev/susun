import { describe, expect, it } from 'vitest'
import { dropSql, qualifiedName, quoteIdent, selectTopSql, truncateSql } from './sql'

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
