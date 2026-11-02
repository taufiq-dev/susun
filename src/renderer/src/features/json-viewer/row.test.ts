import { describe, expect, it } from 'vitest'
import { rowJson } from './row'

// The row's JSON, parsed back, to check its values.
function parsed(columns: string[], values: unknown[], filter?: string): unknown {
  return JSON.parse(rowJson(columns, values, filter) ?? 'null')
}

describe('rowJson', () => {
  it('indents the row, and nested values inside it', () => {
    expect(rowJson(['id', 'data'], [1, { a: [1, { b: null }] }])).toBe(
      [
        '{',
        '  "id": 1,',
        '  "data": {',
        '    "a": [',
        '      1,',
        '      {',
        '        "b": null',
        '      }',
        '    ]',
        '  }',
        '}'
      ].join('\n')
    )
  })

  it('keeps the keys in column order, even integer-like names', () => {
    expect(rowJson(['2', '1', 'a'], ['x', 'y', 'z'])).toBe(
      '{\n  "2": "x",\n  "1": "y",\n  "a": "z"\n}'
    )
  })

  it('suffixes repeated column names', () => {
    expect(rowJson(['id', 'id', 'id'], [1, 2, 3])).toBe(
      '{\n  "id": 1,\n  "id_2": 2,\n  "id_3": 3\n}'
    )
  })

  it("skips a suffix that is another column's name", () => {
    expect(rowJson(['id', 'id', 'id_2'], [1, 2, 3])).toBe(
      '{\n  "id": 1,\n  "id_3": 2,\n  "id_2": 3\n}'
    )
  })

  it('keeps a column named __proto__, in the row and inside a JSON value', () => {
    const inner = JSON.parse('{"__proto__": 1}')
    expect(rowJson(['__proto__', 'j'], [1, inner])).toBe(
      '{\n  "__proto__": 1,\n  "j": {\n    "__proto__": 1\n  }\n}'
    )
  })

  it('escapes names and values', () => {
    expect(parsed(['a"b'], ['line\n"two"'])).toEqual({ 'a"b': 'line\n"two"' })
  })

  it('shows bytes as hex, also inside an array', () => {
    const bytes = new Uint8Array([0, 15, 255])
    expect(parsed(['b', 'list'], [bytes, [bytes]])).toEqual({
      b: '0x000fff',
      list: ['0x000fff']
    })
  })

  it('cuts a large binary value short and says how large it is', () => {
    const value = (parsed(['b'], [new Uint8Array(5000)]) as { b: string }).b
    expect(value).toBe(`0x${'00'.repeat(1024)}… (${(5000).toLocaleString()} bytes)`)
  })

  it('shows all of a binary value that just fits', () => {
    const value = (parsed(['b'], [new Uint8Array(1024)]) as { b: string }).b
    expect(value).toBe(`0x${'00'.repeat(1024)}`)
  })

  it('keeps big integers as they arrive, and NULL as null', () => {
    expect(parsed(['big', 'n', 'u'], ['9007199254740993', null, undefined])).toEqual({
      big: '9007199254740993',
      n: null,
      u: null
    })
  })

  it("doesn't let numbers JSON can't hold read as null", () => {
    expect(parsed(['a', 'b', 'c'], [NaN, Infinity, -Infinity])).toEqual({
      a: 'NaN',
      b: 'Infinity',
      c: '-Infinity'
    })
  })

  it('turns a bigint into a string rather than throwing', () => {
    expect(parsed(['big'], [12345678901234567890n])).toEqual({ big: '12345678901234567890' })
  })

  it('shows a date in ISO form', () => {
    expect(parsed(['d'], [new Date(Date.UTC(2026, 0, 2, 3, 4, 5))])).toEqual({
      d: '2026-01-02T03:04:05.000Z'
    })
  })
})

describe('rowJson with a filter', () => {
  const columns = ['id', 'user_name', 'data']
  const values = [1, 'ann', { city: 'Oslo', address: { City: 'Bergen', zip: 5003 }, tags: [] }]

  it('ignores an empty filter', () => {
    expect(parsed(columns, values, '   ')).toEqual({ id: 1, user_name: 'ann', data: values[2] })
  })

  it('keeps the columns whose names contain it, ignoring case', () => {
    expect(parsed(columns, values, 'NAME')).toEqual({ user_name: 'ann' })
  })

  it('keeps a matching key with everything inside it', () => {
    expect(parsed(columns, values, 'address')).toEqual({
      data: { address: { City: 'Bergen', zip: 5003 } }
    })
  })

  it('finds keys at any depth, keeping the objects around them', () => {
    expect(parsed(columns, values, 'city')).toEqual({
      data: { city: 'Oslo', address: { City: 'Bergen' } }
    })
  })

  it('looks inside arrays, keeping only the items that match', () => {
    const items = { items: [{ sku: 1, qty: 2 }, { other: 3 }, { sku: 4 }] }
    expect(parsed(['j'], [items], 'sku')).toEqual({ j: { items: [{ sku: 1 }, { sku: 4 }] } })
  })

  it('matches keys, not values', () => {
    expect(rowJson(columns, values, 'ann')).toBeNull()
  })

  it('is null when no key matches', () => {
    expect(rowJson(columns, values, 'nothing')).toBeNull()
  })

  it('matches the suffixed name of a repeated column', () => {
    expect(parsed(['id', 'id'], [1, 2], 'id_2')).toEqual({ id_2: 2 })
  })
})
