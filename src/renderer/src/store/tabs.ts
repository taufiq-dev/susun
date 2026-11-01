import { create } from 'zustand'
import type { SqlFile } from '@shared/api'
import type { Statement } from '@shared/split'
import type { Filter, Order } from '@shared/sql'
import type { QueryResult, TableRef } from '@shared/types'
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
  type Pane,
  type Side
} from './panes'

// One statement of a run, with where it is in the editor and how it went. `cancelled` marks the
// error of a statement stopped by Cancel.
export type StatementRun = Statement &
  ({ result: QueryResult } | { error: string; cancelled?: boolean })

// The latest run of a query tab. It lives here rather than in the tab's component, which unmounts
// when another tab is activated in its pane, or the tab moves to another pane. `id` is new for each run.
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
  // The editor's share of the tab's height; the results get the rest.
  editorFraction: number
  // The SQL it was opened with from elsewhere (a history entry, a table's menu), if any: until it
  // changes, closing the tab loses nothing, so it isn't unsaved.
  initialSql?: string
  // The .sql file the tab was opened from or last saved to, and the SQL as read or written then,
  // which tells whether the tab has unsaved changes. A tab on a file is titled with its name.
  file?: { path: string; savedSql: string }
}

export interface TableTabState {
  id: string
  type: 'table'
  title: string
  table: TableRef
  // What the tab shows: the table's rows, or its columns.
  view: TableView
  // Which page of rows (from 0), in what order and with what filter. Without an order the rows
  // are in primary key order, where there is one.
  page: number
  order?: Order
  filter?: Filter
}

export type TableView = 'data' | 'structure'

// What the table tab can change about itself.
export type TableTabChanges = Partial<Pick<TableTabState, 'view' | 'page' | 'order' | 'filter'>>

export type Tab = QueryTabState | TableTabState

interface TabsState {
  tabs: Tab[]
  // How the tab area is split into panes, and each pane's tabs.
  root: LayoutNode
  // The pane that New query and the sidebar open tabs in, and whose active tab the sidebar
  // highlights. Clicking in a pane focuses it.
  focusedPaneId: string
  // The pane filling the tab area, the others hidden, if one is maximized. It is always the focused
  // pane: focusing another (or closing it, or splitting, which focuses the new pane) restores the
  // layout. Kept so by a subscriber.
  maximizedPaneId: string | null
  // Numbers new query tabs: "Query 1", "Query 2", ...
  queryCount: number
  // The editor share a new query tab starts with: the last one set.
  editorFraction: number
  // In the given pane, or else the focused one, with the SQL if given.
  openQuery(paneId?: string, sql?: string): void
  // Opens a query tab on the file in the focused pane, or activates the tab already open on it.
  openFile(file: SqlFile): void
  // The tab has been saved to the file, with this SQL.
  setFile(id: string, file: NonNullable<QueryTabState['file']>): void
  // Activates the table's tab if it is open (the focused pane's, or else another pane's), showing
  // `view` if given.
  openTable(table: TableRef, view?: TableView): void
  updateTable(id: string, changes: TableTabChanges): void
  // Activates the tab in its pane, and focuses the pane.
  activate(tabId: string): void
  focusPane(paneId: string): void
  // Closing a pane's last tab removes the pane, unless it is the only one.
  close(tabId: string): void
  // Opens a copy of the tab in a new pane on `side` of the tab's pane: a table tab on the same
  // table, or a new query tab with the same SQL (and, once it runs, its own session).
  split(tabId: string, side: Side): void
  // Moves the tab into a new pane on `side` of its pane, unless it is the pane's only tab.
  moveToNewPane(tabId: string, side: Side): void
  resize(splitId: string, sizes: number[]): void
  // Maximizes the pane and focuses it, or restores the layout if it is maximized. Does nothing while
  // there is only one pane.
  toggleMaximize(paneId: string): void
  setSql(id: string, sql: string): void
  setEditorFraction(id: string, fraction: number): void
  // These do nothing if the tab has been closed.
  setRun(id: string, run: QueryRun): void
  setRunView(id: string, view: NonNullable<QueryRun['view']>): void
  setSession(id: string, sessionId: string): void
  reset(): void
}

function clampEditorFraction(fraction: number): number {
  return Math.min(0.85, Math.max(0.15, fraction))
}

// The last part of a file's path, e.g. "orders.sql".
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

export function sameTable(a: TableRef, b: TableRef): boolean {
  return a.name === b.name && (a.schema ?? null) === (b.schema ?? null)
}

// The focused pane's active tab.
export function focusedTab(s: TabsState): Tab | undefined {
  const activeId = findPane(s.root, s.focusedPaneId)?.activeId
  return activeId ? s.tabs.find((t) => t.id === activeId) : undefined
}

type Layout = Pick<TabsState, 'root' | 'focusedPaneId'>

function initial(): Pick<TabsState, 'tabs' | 'queryCount' | 'maximizedPaneId'> & Layout {
  const pane = newPane()
  return { tabs: [], root: pane, focusedPaneId: pane.id, maximizedPaneId: null, queryCount: 0 }
}

// The pane to open a tab in: the given one, or else the focused one.
function targetPane(s: TabsState, paneId?: string): Pane {
  return findPane(s.root, paneId ?? s.focusedPaneId) ?? panesOf(s.root)[0]
}

// Adds the tab at the end of the pane's tabs and activates it, focusing the pane.
function addTab(s: TabsState, paneId: string, tabId: string): Layout {
  return {
    root: updatePane(s.root, paneId, (p) => ({
      ...p,
      tabIds: [...p.tabIds, tabId],
      activeId: tabId
    })),
    focusedPaneId: paneId
  }
}

// Takes the tab out of its pane; if it was active, the tab to its right (or else left) becomes
// active. A pane left empty is removed, unless it is the only one, and the focus moves to the
// pane before it (or else after).
function removeTab(s: TabsState, tabId: string): Layout {
  const pane = paneOfTab(s.root, tabId)
  if (!pane) return s
  const index = pane.tabIds.indexOf(tabId)
  const tabIds = pane.tabIds.filter((id) => id !== tabId)
  const activeId =
    pane.activeId === tabId ? (tabIds[index] ?? tabIds[index - 1] ?? null) : pane.activeId
  const root = updatePane(s.root, pane.id, (p) => ({ ...p, tabIds, activeId }))
  if (tabIds.length > 0 || root.type === 'pane') return { root, focusedPaneId: s.focusedPaneId }
  const order = panesOf(root)
  const at = order.findIndex((p) => p.id === pane.id)
  const focusedPaneId =
    s.focusedPaneId === pane.id ? (order[at - 1] ?? order[at + 1]).id : s.focusedPaneId
  return { root: removePane(root, pane.id), focusedPaneId }
}

function newQueryTab(s: TabsState, sql = '', editorFraction = s.editorFraction): QueryTabState {
  return {
    id: crypto.randomUUID(),
    type: 'query',
    title: `Query ${s.queryCount + 1}`,
    sql,
    editorFraction
  }
}

function updateTableTab(
  s: TabsState,
  id: string,
  update: (tab: TableTabState) => TableTabState
): Pick<TabsState, 'tabs'> {
  return { tabs: s.tabs.map((t) => (t.id === id && t.type === 'table' ? update(t) : t)) }
}

function updateQueryTab(
  s: TabsState,
  id: string,
  update: (tab: QueryTabState) => QueryTabState
): Pick<TabsState, 'tabs'> {
  return { tabs: s.tabs.map((t) => (t.id === id && t.type === 'query' ? update(t) : t)) }
}

export const useTabs = create<TabsState>()((set) => ({
  ...initial(),
  editorFraction: 0.4,

  openQuery: (paneId, sql) =>
    set((s) => {
      const tab = { ...newQueryTab(s, sql), ...(sql && { initialSql: sql }) }
      return {
        tabs: [...s.tabs, tab],
        queryCount: s.queryCount + 1,
        ...addTab(s, targetPane(s, paneId).id, tab.id)
      }
    }),

  openFile: (file) =>
    set((s) => {
      const existing = s.tabs.find((t) => t.type === 'query' && t.file?.path === file.path)
      const pane = existing && paneOfTab(s.root, existing.id)
      if (existing && pane) {
        return {
          root: updatePane(s.root, pane.id, (p) => ({ ...p, activeId: existing.id })),
          focusedPaneId: pane.id
        }
      }
      const tab: QueryTabState = {
        ...newQueryTab(s, file.sql),
        title: fileName(file.path),
        file: { path: file.path, savedSql: file.sql }
      }
      return { tabs: [...s.tabs, tab], ...addTab(s, targetPane(s).id, tab.id) }
    }),

  setFile: (id, file) =>
    set((s) => updateQueryTab(s, id, (t) => ({ ...t, file, title: fileName(file.path) }))),

  openTable: (table, view) =>
    set((s) => {
      const open = s.tabs.filter((t) => t.type === 'table' && sameTable(t.table, table))
      const focused = findPane(s.root, s.focusedPaneId)
      const existing = open.find((t) => focused?.tabIds.includes(t.id)) ?? open[0]
      const pane = existing && paneOfTab(s.root, existing.id)
      if (existing && pane) {
        return {
          ...(view && updateTableTab(s, existing.id, (t) => ({ ...t, view }))),
          root: updatePane(s.root, pane.id, (p) => ({ ...p, activeId: existing.id })),
          focusedPaneId: pane.id
        }
      }
      const tab: Tab = {
        id: crypto.randomUUID(),
        type: 'table',
        title: table.name,
        table: { schema: table.schema, name: table.name },
        view: view ?? 'data',
        page: 0
      }
      return { tabs: [...s.tabs, tab], ...addTab(s, targetPane(s).id, tab.id) }
    }),

  activate: (tabId) =>
    set((s) => {
      const pane = paneOfTab(s.root, tabId)
      if (!pane) return s
      return {
        root: updatePane(s.root, pane.id, (p) => ({ ...p, activeId: tabId })),
        focusedPaneId: pane.id
      }
    }),

  // Returning the same state skips notifying, since a click anywhere in a pane focuses it.
  focusPane: (paneId) =>
    set((s) =>
      s.focusedPaneId === paneId || !findPane(s.root, paneId) ? s : { focusedPaneId: paneId }
    ),

  close: (tabId) =>
    set((s) => ({ tabs: s.tabs.filter((t) => t.id !== tabId), ...removeTab(s, tabId) })),

  split: (tabId, side) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      const pane = paneOfTab(s.root, tabId)
      if (!tab || !pane) return s
      // A copy of a query tab on a file is on the same file (saving either writes it).
      const copy: Tab =
        tab.type === 'query'
          ? {
              ...newQueryTab(s, tab.sql, tab.editorFraction),
              ...(tab.file && { title: tab.title, file: tab.file })
            }
          : { ...tab, id: crypto.randomUUID() }
      const target = newPane([copy.id])
      return {
        tabs: [...s.tabs, copy],
        queryCount: tab.type === 'query' && !tab.file ? s.queryCount + 1 : s.queryCount,
        root: insertPane(s.root, pane.id, side, target),
        focusedPaneId: target.id
      }
    }),

  moveToNewPane: (tabId, side) =>
    set((s) => {
      const pane = paneOfTab(s.root, tabId)
      if (!pane || pane.tabIds.length < 2) return s
      const target = newPane([tabId])
      const { root } = removeTab(s, tabId)
      return { root: insertPane(root, pane.id, side, target), focusedPaneId: target.id }
    }),

  resize: (splitId, sizes) => set((s) => ({ root: resizeSplit(s.root, splitId, sizes) })),

  toggleMaximize: (paneId) =>
    set((s) => {
      if (s.root.type === 'pane' || !findPane(s.root, paneId)) return s
      return {
        maximizedPaneId: s.maximizedPaneId === paneId ? null : paneId,
        focusedPaneId: paneId
      }
    }),

  updateTable: (id, changes) => set((s) => updateTableTab(s, id, (t) => ({ ...t, ...changes }))),

  setSql: (id, sql) => set((s) => updateQueryTab(s, id, (t) => ({ ...t, sql }))),

  setEditorFraction: (id, fraction) =>
    set((s) => {
      const editorFraction = clampEditorFraction(fraction)
      return { editorFraction, ...updateQueryTab(s, id, (t) => ({ ...t, editorFraction })) }
    }),

  setRun: (id, run) => set((s) => updateQueryTab(s, id, (t) => ({ ...t, run }))),

  setRunView: (id, view) =>
    set((s) => updateQueryTab(s, id, (t) => (t.run ? { ...t, run: { ...t.run, view } } : t))),

  setSession: (id, sessionId) => set((s) => updateQueryTab(s, id, (t) => ({ ...t, sessionId }))),

  reset: () => set(initial())
}))

useTabs.subscribe((s) => {
  if (s.maximizedPaneId === null) return
  if (s.maximizedPaneId !== s.focusedPaneId || s.root.type === 'pane') {
    useTabs.setState({ maximizedPaneId: null })
  }
})
