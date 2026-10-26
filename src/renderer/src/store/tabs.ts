import { create } from 'zustand'
import type { TableRef } from '@shared/types'

export interface QueryTabState {
  id: string
  type: 'query'
  title: string
  sql: string
}

export interface TableTabState {
  id: string
  type: 'table'
  title: string
  table: TableRef
}

export type Tab = QueryTabState | TableTabState

interface TabsState {
  tabs: Tab[]
  activeId: string | null
  // Numbers new query tabs: "Query 1", "Query 2", ...
  queryCount: number
  openQuery(): void
  // Activates the table's tab if it is already open.
  openTable(table: TableRef): void
  activate(id: string): void
  close(id: string): void
  setSql(id: string, sql: string): void
  reset(): void
}

export function sameTable(a: TableRef, b: TableRef): boolean {
  return a.name === b.name && (a.schema ?? null) === (b.schema ?? null)
}

export const useTabs = create<TabsState>()((set) => ({
  tabs: [],
  activeId: null,
  queryCount: 0,

  openQuery: () =>
    set((s) => {
      const count = s.queryCount + 1
      const tab: Tab = { id: crypto.randomUUID(), type: 'query', title: `Query ${count}`, sql: '' }
      return { tabs: [...s.tabs, tab], activeId: tab.id, queryCount: count }
    }),

  openTable: (table) =>
    set((s) => {
      const open = s.tabs.find((t) => t.type === 'table' && sameTable(t.table, table))
      if (open) return { activeId: open.id }
      const tab: Tab = {
        id: crypto.randomUUID(),
        type: 'table',
        title: table.name,
        table: { schema: table.schema, name: table.name }
      }
      return { tabs: [...s.tabs, tab], activeId: tab.id }
    }),

  activate: (id) => set({ activeId: id }),

  // Closing the active tab activates the one to its right, or else its left.
  close: (id) =>
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === id)
      if (index === -1) return {}
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeId =
        s.activeId === id ? ((tabs[index] ?? tabs[index - 1])?.id ?? null) : s.activeId
      return { tabs, activeId }
    }),

  setSql: (id, sql) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id && t.type === 'query' ? { ...t, sql } : t))
    })),

  reset: () => set({ tabs: [], activeId: null, queryCount: 0 })
}))
