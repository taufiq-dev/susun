import { describe, expect, it } from 'vitest'
import {
  findPane,
  insertPane,
  newPane,
  paneOfTab,
  panesOf,
  removePane,
  resizeSplit,
  updatePane,
  type LayoutNode,
  type Pane
} from './panes'

// The tree's shape, with panes by their first tab id and sizes rounded.
function shape(node: LayoutNode): unknown {
  if (node.type === 'pane') return node.tabIds[0] ?? '-'
  return {
    [node.direction]: node.children.map(shape),
    sizes: node.sizes.map((s) => Math.round(s * 1000) / 1000)
  }
}

const pane = (tab: string): Pane => newPane([tab])

describe('insertPane', () => {
  it('splits a lone pane in the direction of the side', () => {
    const a = pane('a')
    expect(shape(insertPane(a, a.id, 'right', pane('b')))).toEqual({
      row: ['a', 'b'],
      sizes: [0.5, 0.5]
    })
    expect(shape(insertPane(a, a.id, 'up', pane('b')))).toEqual({
      column: ['b', 'a'],
      sizes: [0.5, 0.5]
    })
  })

  it('adds a sibling in a split of the same direction, evening out equal panes', () => {
    const a = pane('a')
    const b = pane('b')
    const root = insertPane(a, a.id, 'right', b)
    expect(shape(insertPane(root, b.id, 'right', pane('c')))).toEqual({
      row: ['a', 'b', 'c'],
      sizes: [0.333, 0.333, 0.333]
    })
    expect(shape(insertPane(root, b.id, 'left', pane('c')))).toEqual({
      row: ['a', 'c', 'b'],
      sizes: [0.333, 0.333, 0.333]
    })
  })

  it('halves the target in a split of unequal panes', () => {
    const a = pane('a')
    const b = pane('b')
    const split = insertPane(a, a.id, 'right', b)
    if (split.type !== 'split') throw new Error('expected a split')
    const uneven = resizeSplit(split, split.id, [0.6, 0.4])
    expect(shape(insertPane(uneven, b.id, 'right', pane('c')))).toEqual({
      row: ['a', 'b', 'c'],
      sizes: [0.6, 0.2, 0.2]
    })
  })

  it('nests a split of the other direction', () => {
    const a = pane('a')
    const b = pane('b')
    const root = insertPane(a, a.id, 'right', b)
    expect(shape(insertPane(root, b.id, 'down', pane('c')))).toEqual({
      row: ['a', { column: ['b', 'c'], sizes: [0.5, 0.5] }],
      sizes: [0.5, 0.5]
    })
  })
})

describe('removePane', () => {
  const a = pane('a')
  const b = pane('b')
  const c = pane('c')
  const d = pane('d')
  // a | (b over (c | d))
  let root: LayoutNode = insertPane(a, a.id, 'right', b)
  root = insertPane(root, b.id, 'down', c)
  root = insertPane(root, c.id, 'right', d)

  it('replaces a split left with one child by that child', () => {
    expect(shape(removePane(insertPane(a, a.id, 'right', b), b.id))).toBe('a')
  })

  it('merges a split left inside one of the same direction', () => {
    // Without b, the column holds only c | d, which joins the outer row.
    expect(shape(removePane(root, b.id))).toEqual({
      row: ['a', 'c', 'd'],
      sizes: [0.5, 0.25, 0.25]
    })
  })

  it('gives the space to the remaining children', () => {
    const three = insertPane(insertPane(a, a.id, 'right', b), b.id, 'right', c)
    if (three.type !== 'split') throw new Error('expected a split')
    const uneven = resizeSplit(three, three.id, [0.5, 0.3, 0.2])
    expect(shape(removePane(uneven, a.id))).toEqual({ row: ['b', 'c'], sizes: [0.6, 0.4] })
  })

  it('keeps the last pane, and ignores an unknown id', () => {
    expect(removePane(a, a.id)).toBe(a)
    expect(removePane(root, 'nope')).toBe(root)
  })
})

describe('lookups and updates', () => {
  const a = pane('a')
  const b = newPane(['b', 'b2'])
  const root = insertPane(a, a.id, 'down', b)

  it('lists panes in reading order and finds them', () => {
    expect(panesOf(root).map((p) => p.tabIds[0])).toEqual(['a', 'b'])
    expect(findPane(root, b.id)).toBe(b)
    expect(paneOfTab(root, 'b2')).toBe(b)
    expect(paneOfTab(root, 'x')).toBeUndefined()
  })

  it('updates one pane and keeps the rest of the tree', () => {
    const next = updatePane(root, b.id, (p) => ({ ...p, activeId: 'b2' }))
    expect(findPane(next, b.id)?.activeId).toBe('b2')
    expect(findPane(next, a.id)).toBe(a)
    expect(updatePane(root, 'nope', (p) => ({ ...p }))).toBe(root)
  })

  it('resizes a split, normalizing the sizes', () => {
    if (root.type !== 'split') throw new Error('expected a split')
    expect(shape(resizeSplit(root, root.id, [1, 3]))).toEqual({
      column: ['a', 'b'],
      sizes: [0.25, 0.75]
    })
  })
})
