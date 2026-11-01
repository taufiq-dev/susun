import { create } from 'zustand'
import type { Statement } from '@shared/split'
import type { QueryResult, TableRef } from '@shared/types'

// One statement of a run, with where it is in the editor and how it went. `cancelled` marks the
// error of a statement stopped by Cancel.
export type StatementRun = Statement &
  ({ result: QueryResult } | { error: string; cancelled?: boolean })

// The latest run of a query tab. It lives here rather than in the tab's component, which unmounts
// when another tab is activated. `id` is new for each run.
export interface QueryRun {
  id: number
  state: 'running' | 'done' | 'failed' | 'cancelled'
  // How many statements the run has.
  total: number
  // Those that have run, in order. After a failure the last one has the error, and the statements
  // after it didn't run. Cancel stops the running statement (which then has an error) or, between
  // statements, the next one from starting.
  statements: StatementRun[]
  // Cancel has been asked for and the run hasn't stopped yet.
  cancelling?: boolean
  // Why asking to cancel failed, if it did.
  cancelError?: string
  // The tab's session is being opened, before the first statement runs.
  connecting?: boolean
  // Why the tab's session couldn't be opened, in which case no statement ran.
  connectError?: string
  // What the results pane shows, once chosen: a statement's rows (its index in `statements`) or
  // the list of statements.
  view?: number | 'statements'
}

export interface QueryTabState {
  id: string
  type: 'query'
  title: string
  sql: string
  run?: QueryRun
  // The tab's own database session (see `DbApi.openSession`), once its first run has opened it.
  sessionId?: string
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
  // These do nothing if the tab has been closed.
  setRun(id: string, run: QueryRun): void
  setRunView(id: string, view: NonNullable<QueryRun['view']>): void
  setSession(id: string, sessionId: string): void
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

  setRun: (id, run) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id && t.type === 'query' ? { ...t, run } : t))
    })),

  setRunView: (id, view) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id && t.type === 'query' && t.run ? { ...t, run: { ...t.run, view } } : t
      )
    })),

  setSession: (id, sessionId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id && t.type === 'query' ? { ...t, sessionId } : t))
    })),

  reset: () => set({ tabs: [], activeId: null, queryCount: 0 })
}))
