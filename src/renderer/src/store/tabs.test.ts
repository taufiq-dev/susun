import { beforeEach, describe, expect, it } from 'vitest'
import { panesOf } from './panes'
import { useTabs } from './tabs'

// Three query tabs in one pane, then whatever a test arranges.
function setup(): string[] {
  useTabs.getState().reset()
  for (let i = 0; i < 3; i++) useTabs.getState().openQuery()
  return useTabs.getState().tabs.map((t) => t.id)
}

const panes = (): { tabs: string[]; active: string | null }[] =>
  panesOf(useTabs.getState().root).map((p) => ({ tabs: p.tabIds, active: p.activeId }))

describe('moving tabs', () => {
  let a: string, b: string, c: string
  beforeEach(() => {
    ;[a, b, c] = setup()
  })

  it('reorders within a pane, counting the tab’s own place', () => {
    useTabs.getState().moveTab(a, panesOf(useTabs.getState().root)[0].id, 3)
    expect(panes()).toEqual([{ tabs: [b, c, a], active: a }])
    const pane = panesOf(useTabs.getState().root)[0].id
    useTabs.getState().moveTab(a, pane, 0)
    expect(panes()).toEqual([{ tabs: [a, b, c], active: a }])
    useTabs.getState().moveTab(c, pane, 1)
    expect(panes()).toEqual([{ tabs: [a, c, b], active: c }])
  })

  it('moves a tab into another pane at a place, and focuses it', () => {
    const first = panesOf(useTabs.getState().root)[0].id
    useTabs.getState().moveTabToSide(c, first, 'right')
    const second = panesOf(useTabs.getState().root)[1].id
    useTabs.getState().moveTab(a, second, 0)
    expect(panes()).toEqual([
      { tabs: [b], active: b },
      { tabs: [a, c], active: a }
    ])
    expect(useTabs.getState().focusedPaneId).toBe(second)
  })

  it('removes a pane its last tab leaves', () => {
    const first = panesOf(useTabs.getState().root)[0].id
    useTabs.getState().moveTabToSide(c, first, 'down')
    const second = panesOf(useTabs.getState().root)[1].id
    useTabs.getState().moveTab(c, first, 1)
    expect(panes()).toEqual([{ tabs: [a, c, b], active: c }])
    expect(useTabs.getState().root.type).toBe('pane')
    expect(useTabs.getState().focusedPaneId).not.toBe(second)
  })

  it('splits beside another pane, on any side', () => {
    const first = panesOf(useTabs.getState().root)[0].id
    useTabs.getState().moveTabToSide(b, first, 'left')
    expect(panes().map((p) => p.tabs)).toEqual([[b], [a, c]])
    const root = useTabs.getState().root
    expect(root.type === 'split' && root.direction).toBe('row')
    useTabs.getState().moveTabToSide(c, first, 'up')
    expect(panes().map((p) => p.tabs)).toEqual([[b], [c], [a]])
  })

  it('doesn’t split a pane by its only tab', () => {
    const first = panesOf(useTabs.getState().root)[0].id
    useTabs.getState().moveTabToSide(c, first, 'right')
    const second = panesOf(useTabs.getState().root)[1].id
    const before = useTabs.getState().root
    useTabs.getState().moveTabToSide(c, second, 'down')
    expect(useTabs.getState().root).toBe(before)
  })

  it('moves a pane’s only tab beside another pane, removing its old pane', () => {
    const first = panesOf(useTabs.getState().root)[0].id
    useTabs.getState().moveTabToSide(c, first, 'right')
    useTabs.getState().moveTabToSide(c, first, 'down')
    expect(panes().map((p) => p.tabs)).toEqual([[a, b], [c]])
    const root = useTabs.getState().root
    expect(root.type === 'split' && root.direction).toBe('column')
  })
})
