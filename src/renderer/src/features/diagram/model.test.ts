import { describe, expect, it } from 'vitest'
import type { ForeignKeyInfo, TableInfo } from '@shared/types'
import {
  initialViewport,
  layout,
  linkSides,
  linksAmong,
  nodeSize,
  referencesOf,
  tableKey,
  tablesToShow
} from './model'

function fk(
  table: string,
  columns: string[],
  references: string,
  referencedColumns: string[],
  schema?: string,
  referencedSchema = schema
): ForeignKeyInfo {
  return {
    name: null,
    table: { schema, name: table },
    columns,
    references: { schema: referencedSchema, name: references },
    referencedColumns,
    onUpdate: 'NO ACTION',
    onDelete: 'NO ACTION'
  }
}

const TABLES: TableInfo[] = [
  { schema: 'public', name: 'accounts', type: 'table' },
  { schema: 'public', name: 'orders', type: 'table' },
  { schema: 'public', name: 'order_items', type: 'table' },
  { schema: 'public', name: 'products', type: 'table' },
  { schema: 'public', name: 'unlinked', type: 'table' },
  { schema: 'public', name: 'order_totals', type: 'view' },
  { schema: 'audit', name: 'events', type: 'table' }
]

const KEYS = [
  fk('orders', ['account_id'], 'accounts', ['id'], 'public'),
  fk('order_items', ['order_id'], 'orders', ['id'], 'public'),
  fk('order_items', ['product_id'], 'products', ['id'], 'public'),
  fk('events', ['order_id'], 'orders', ['id'], 'audit', 'public'),
  // A tree: an account's parent account.
  fk('accounts', ['parent_id'], 'accounts', ['id'], 'public')
]

describe('tablesToShow', () => {
  it('shows the table, then those it refers to and those referring to it, by name', () => {
    const shown = tablesToShow({ schema: 'public', name: 'orders' }, 'related', TABLES, KEYS)
    expect(shown).toEqual([
      { schema: 'public', name: 'orders' },
      { schema: 'audit', name: 'events' },
      { schema: 'public', name: 'accounts' },
      { schema: 'public', name: 'order_items' }
    ])
  })

  it('shows a table referring to itself once', () => {
    const shown = tablesToShow({ schema: 'public', name: 'accounts' }, 'related', TABLES, KEYS)
    expect(shown.map((t) => t.name)).toEqual(['accounts', 'orders'])
  })

  it('shows just the table when no foreign key links it', () => {
    const shown = tablesToShow({ schema: 'public', name: 'unlinked' }, 'related', TABLES, KEYS)
    expect(shown).toEqual([{ schema: 'public', name: 'unlinked' }])
  })

  it("shows every table of the table's schema, not views or other schemas", () => {
    const shown = tablesToShow({ schema: 'public', name: 'orders' }, 'all', TABLES, KEYS)
    expect(shown.map((t) => t.name)).toEqual([
      'orders',
      'accounts',
      'order_items',
      'products',
      'unlinked'
    ])
  })

  it('treats tables without a schema (MySQL, SQLite) as one schema', () => {
    const tables: TableInfo[] = [
      { name: 'a', type: 'table' },
      { name: 'b', type: 'table' }
    ]
    expect(tablesToShow({ name: 'b' }, 'all', tables, [])).toEqual([
      { schema: undefined, name: 'b' },
      { schema: undefined, name: 'a' }
    ])
  })
})

describe('linksAmong', () => {
  it('keeps the keys whose two tables are shown', () => {
    const shown = tablesToShow({ schema: 'public', name: 'orders' }, 'related', TABLES, KEYS)
    const links = linksAmong(shown, KEYS)
    // order_items → products is left out, since products isn't shown.
    expect(links.map((l) => `${l.key.table.name}→${l.key.references.name}`)).toEqual([
      'orders→accounts',
      'order_items→orders',
      'events→orders',
      'accounts→accounts'
    ])
    expect(links[0].source).toBe(tableKey({ schema: 'public', name: 'orders' }))
    expect(links[0].target).toBe(tableKey({ schema: 'public', name: 'accounts' }))
    expect(new Set(links.map((l) => l.id)).size).toBe(links.length)
  })
})

describe('tableKey', () => {
  it('tells apart a schema-qualified name from a name with a dot in it', () => {
    expect(tableKey({ schema: 'a', name: 'b' })).not.toBe(tableKey({ name: 'a.b' }))
  })
})

describe('nodeSize', () => {
  const column = (name: string, dataType: string): Parameters<typeof nodeSize>[1][number] => ({
    name,
    dataType,
    nullable: true,
    defaultValue: null,
    primaryKey: false
  })

  it('is tall enough for its header, a row per column (or one with none), padding and border', () => {
    expect(nodeSize({ name: 't' }, []).height).toBe(32 + 22 + 10)
    expect(nodeSize({ name: 't' }, [column('a', 'int'), column('b', 'int')]).height).toBe(
      32 + 44 + 10
    )
  })

  it('widens for long names and types, within limits', () => {
    const narrow = nodeSize({ name: 't' }, [column('id', 'int')]).width
    const wide = nodeSize({ name: 't' }, [column('description', 'character varying(255)')]).width
    const widest = nodeSize({ name: 't' }, [column('x'.repeat(200), 'text')]).width
    expect(narrow).toBe(180)
    expect(wide).toBeGreaterThan(narrow)
    expect(widest).toBe(360)
  })
})

describe('layout', () => {
  const node = (id: string, height = 100): { id: string; width: number; height: number } => ({
    id,
    width: 200,
    height
  })

  it('puts a table left of the tables referring to it', () => {
    const at = layout([node('child'), node('parent')], [{ source: 'child', target: 'parent' }])
    expect(at.get('parent')!.x + 200).toBeLessThan(at.get('child')!.x)
  })

  it('places every table, without overlaps, unlinked ones beneath the linked', () => {
    const nodes = [node('a'), node('b', 300), node('c'), node('lone1'), node('lone2'), node('self')]
    const links = [
      { source: 'b', target: 'a' },
      { source: 'c', target: 'a' },
      { source: 'self', target: 'self' }
    ]
    const at = layout(nodes, links)
    expect([...at.keys()].sort()).toEqual(['a', 'b', 'c', 'lone1', 'lone2', 'self'])
    const boxes = nodes.map((n) => ({ ...n, ...at.get(n.id)! }))
    for (const p of boxes) {
      for (const q of boxes) {
        if (p === q) continue
        const apart =
          p.x + p.width <= q.x ||
          q.x + q.width <= p.x ||
          p.y + p.height <= q.y ||
          q.y + q.height <= p.y
        expect(apart, `${p.id} overlaps ${q.id}`).toBe(true)
      }
    }
    const linkedBottom = Math.max(
      ...boxes.filter((b) => 'abc'.includes(b.id)).map((b) => b.y + b.height)
    )
    for (const id of ['lone1', 'lone2', 'self']) expect(at.get(id)!.y).toBeGreaterThan(linkedBottom)
  })

  it('lays out a diagram of only unlinked tables as a grid from the origin', () => {
    const at = layout([node('a'), node('b'), node('c'), node('d')], [])
    expect(at.get('a')).toEqual({ x: 0, y: 0 })
    expect(at.get('b')).toEqual({ x: 232, y: 0 })
    // Four tables make rows of three.
    expect(at.get('d')).toEqual({ x: 0, y: 132 })
  })

  it('wraps a column of many tables referring to one into balanced columns', () => {
    const children = Array.from({ length: 12 }, (_, i) => node(`child${i}`))
    const nodes = [node('hub'), ...children, node('grandchild')]
    const links = [
      ...children.map((c) => ({ source: c.id, target: 'hub' })),
      { source: 'grandchild', target: 'child0' }
    ]
    const at = layout(nodes, links)
    const xs = new Set(children.map((c) => at.get(c.id)!.x))
    // 12 tables of 100px make a column 1,552px tall, against about 518px for the diagram's area:
    // three columns of four.
    expect(xs.size).toBe(3)
    for (const x of xs) {
      expect(children.filter((c) => at.get(c.id)!.x === x)).toHaveLength(4)
      expect(at.get('hub')!.x + 200).toBeLessThan(x)
    }
    // The rank after it moved over, clear of the new columns.
    expect(at.get('grandchild')!.x).toBeGreaterThan(Math.max(...xs) + 200)
    const boxes = nodes.map((n) => ({ ...n, ...at.get(n.id)! }))
    for (const p of boxes) {
      for (const q of boxes) {
        if (p === q) continue
        const apart =
          p.x + p.width <= q.x ||
          q.x + q.width <= p.x ||
          p.y + p.height <= q.y ||
          q.y + q.height <= p.y
        expect(apart, `${p.id} overlaps ${q.id}`).toBe(true)
      }
    }
  })
})

describe('linkSides', () => {
  const box = (x: number): { x: number; y: number; width: number } => ({ x, y: 0, width: 100 })

  it('faces the two tables when one is to the side of the other', () => {
    expect(linkSides(box(0), box(300), false)).toEqual({ source: 'right', target: 'left' })
    expect(linkSides(box(300), box(0), false)).toEqual({ source: 'left', target: 'right' })
  })

  it('loops on the right for tables one above the other, or a table referring to itself', () => {
    expect(linkSides(box(0), box(50), false)).toEqual({ source: 'right', target: 'right' })
    expect(linkSides(box(0), box(0), true)).toEqual({ source: 'right', target: 'right' })
  })
})

describe('referencesOf', () => {
  it("names what each of the table's foreign key columns refers to", () => {
    const refs = referencesOf({ schema: 'audit', name: 'events' }, KEYS)
    expect(refs).toEqual(new Map([['order_id', ['public.orders.id']]]))
    const composite = referencesOf({ name: 'line' }, [
      fk('line', ['order_id', 'n'], 'slot', ['order_id', 'n']),
      fk('line', ['order_id'], 'orders', ['id'])
    ])
    expect(composite).toEqual(
      new Map([
        ['order_id', ['slot.order_id', 'orders.id']],
        ['n', ['slot.n']]
      ])
    )
  })
})

describe('initialViewport', () => {
  const pane = { width: 800, height: 600 }
  type Box = { id: string; x: number; y: number; width: number; height: number }
  const box = (id: string, x: number, y: number, width = 200, height = 100): Box => ({
    id,
    x,
    y,
    width,
    height
  })

  it('centres a small diagram at 100%, not larger', () => {
    expect(initialViewport([box('a', 0, 0), box('b', 300, 0)], 'a', pane)).toEqual({
      x: 150,
      y: 250,
      zoom: 1
    })
  })

  it('fits a diagram that is readable when fitted', () => {
    // 1,000px wide in 800 - 48: 75%.
    const view = initialViewport([box('a', 0, 0), box('b', 800, 300)], 'a', pane)
    expect(view.zoom).toBeCloseTo(0.752)
    expect(view.x).toBe(24)
  })

  it('opens a diagram too big to read fitted at 80%, centred on its own table', () => {
    const boxes = [box('a', 0, 0), box('own', 2000, 1000), box('c', 4000, 2000)]
    expect(initialViewport(boxes, 'own', pane)).toEqual({
      x: 400 - 2100 * 0.8,
      y: 300 - 1050 * 0.8,
      zoom: 0.8
    })
  })

  it('shows the top of an own table taller than the pane', () => {
    const boxes = [box('a', 0, 0), box('own', 3000, 500, 200, 1000), box('c', 6000, 0)]
    expect(initialViewport(boxes, 'own', pane).y).toBe(24 - 500 * 0.8)
  })
})
