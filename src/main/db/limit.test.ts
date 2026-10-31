import { describe, expect, it } from 'vitest'
import { stopsAtLimit } from './limit'

describe('stopsAtLimit', () => {
  it('is true for queries', () => {
    expect(stopsAtLimit('select archive_order(id) from orders')).toBe(true)
    expect(stopsAtLimit('SELECT 1')).toBe(true)
    expect(stopsAtLimit('values (1), (2)')).toBe(true)
    expect(stopsAtLimit('table orders')).toBe(true)
    expect(stopsAtLimit('with t as (select 1) select * from t')).toBe(true)
    expect(
      stopsAtLimit(
        'with recursive c(x) as (select 1 union all select x + 1 from c) select x from c'
      )
    ).toBe(true)
  })

  it('skips leading whitespace, comments and parentheses', () => {
    expect(stopsAtLimit('\n  -- note\n/* more */ (select 1) union (select 2)')).toBe(true)
    expect(stopsAtLimit('-- note\ndelete from t returning id')).toBe(false)
  })

  it('is false for statements that change data and return rows', () => {
    expect(stopsAtLimit('delete from t returning id')).toBe(false)
    expect(stopsAtLimit('INSERT INTO t SELECT * FROM u RETURNING id')).toBe(false)
    expect(stopsAtLimit('update t set x = 1 returning *')).toBe(false)
    expect(
      stopsAtLimit('merge into t using u on t.id = u.id when matched then delete returning *')
    ).toBe(false)
    expect(stopsAtLimit('replace into t values (1) returning *')).toBe(false)
  })

  it('is false for a WITH whose subqueries change data', () => {
    expect(stopsAtLimit('with d as (delete from t returning id) select id from d')).toBe(false)
    expect(
      stopsAtLimit('with d as materialized ( -- go\n  update t set x = 1 returning *) table d')
    ).toBe(false)
    // A column merely named like a command doesn't count.
    expect(stopsAtLimit('with d as (select deleted from t) select * from d')).toBe(true)
  })

  it('is false for commands that run to the end', () => {
    expect(stopsAtLimit('explain analyze select 1')).toBe(false)
    expect(stopsAtLimit('show all')).toBe(false)
    expect(stopsAtLimit('fetch 20000 from c')).toBe(false)
    expect(stopsAtLimit('pragma table_info(t)')).toBe(false)
    expect(stopsAtLimit('')).toBe(false)
  })
})
