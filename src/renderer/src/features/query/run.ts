import type { Statement } from '@shared/split'
import type { NewHistoryEntry } from '@shared/types'
import { useLibrary } from '@renderer/store/library'
import { useTabs, type QueryRun, type QueryTabState, type StatementRun } from '@renderer/store/tabs'

// While a script runs, its progress is written to the store at most this often, so a script of
// thousands of quick statements doesn't re-render for each one.
const PROGRESS_INTERVAL_MS = 100

let lastRunId = 0
// Runs that Cancel has been asked to stop.
const cancelled = new Set<number>()

function queryTab(tabId: string): QueryTabState | undefined {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
  return tab?.type === 'query' ? tab : undefined
}

function isOpen(tabId: string): boolean {
  return useTabs.getState().tabs.some((t) => t.id === tabId)
}

function closeQuietly(sessionId: string): void {
  window.api.db.closeSession(sessionId).catch((err: Error) => {
    console.error('closing a session failed:', err.message)
  })
}

// The tab's session, opened on its first run. Null if the tab was closed while it opened.
async function tabSession(connectionId: string, tabId: string): Promise<string | null> {
  const existing = queryTab(tabId)?.sessionId
  if (existing) return existing
  const sessionId = await window.api.db.openSession(connectionId)
  if (!isOpen(tabId)) {
    closeQuietly(sessionId)
    return null
  }
  useTabs.getState().setSession(tabId, sessionId)
  return sessionId
}

function count(n: number, noun: string): string {
  return `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`
}

// A finished run for the connection's history: the SQL as written in the editor, from the first
// statement's start to the last one's end, and a line on how it went.
function historyEntry(
  sql: string,
  statements: Statement[],
  ran: StatementRun[],
  state: QueryRun['state'],
  durationMs: number
): NewHistoryEntry {
  const text = sql.slice(statements[0].from, statements[statements.length - 1].to)
  const last = ran[ran.length - 1]
  let summary: string
  if (state === 'cancelled') summary = 'Cancelled'
  else if (last && 'error' in last) summary = last.error.split('\n')[0]
  else if (statements.length > 1) summary = count(ran.length, 'statement')
  else if (last && last.result.columns.length > 0) {
    summary = count(last.result.rowCount ?? last.result.rows.length, 'row')
  } else summary = `${count(last?.result.rowCount ?? 0, 'row')} changed`
  const status = state === 'cancelled' ? 'cancelled' : state === 'failed' ? 'failed' : 'done'
  return { sql: text, status, summary, durationMs }
}

// Adds the run to the connection's history. A failure only goes to the console: the run itself
// is fine.
function remember(connectionId: string, entry: NewHistoryEntry): void {
  window.api.history.add(connectionId, entry).then(
    () => useLibrary.getState().historyChanged(),
    (err: Error) => console.error('adding to history failed:', err.message)
  )
}

// Runs a query tab's statements one at a time in the tab's own session, stopping at the first
// error or at Cancel, and records the run in the tabs store so it isn't lost when the tab's
// component unmounts. Does nothing without statements, or while the tab's last run is going.
// Stops if the tab is closed.
export async function runQuery(
  connectionId: string,
  tabId: string,
  statements: Statement[]
): Promise<void> {
  const tab = queryTab(tabId)
  if (!tab || tab.run?.state === 'running' || statements.length === 0) return

  const id = ++lastRunId
  const ran: StatementRun[] = []
  let connecting = !tab.sessionId
  let finalState: QueryRun['state'] = 'running'
  let started = 0
  // Keeps what the user changed meanwhile: the result shown, a failed cancel.
  const record = (state: QueryRun['state'], connectError?: string): void => {
    finalState = state
    const current = queryTab(tabId)?.run
    useTabs.getState().setRun(tabId, {
      ...(current?.id === id ? current : {}),
      id,
      state,
      total: statements.length,
      statements: [...ran],
      cancelling: state === 'running' && cancelled.has(id),
      connecting: state === 'running' && connecting,
      connectError
    })
  }

  record('running')
  try {
    let sessionId: string | null
    try {
      sessionId = await tabSession(connectionId, tabId)
    } catch (err) {
      return record('failed', (err as Error).message)
    }
    if (!sessionId) return
    if (connecting) {
      connecting = false
      record('running')
    }
    started = performance.now()
    let recordedAt = performance.now()
    for (const statement of statements) {
      if (!isOpen(tabId)) return
      if (cancelled.has(id)) return record('cancelled')
      try {
        ran.push({ ...statement, result: await window.api.db.query(sessionId, statement.sql) })
      } catch (err) {
        const stopped = cancelled.has(id)
        ran.push({
          ...statement,
          error: (err as Error).message,
          ...(stopped && { cancelled: true })
        })
        return record(stopped ? 'cancelled' : 'failed')
      }
      if (performance.now() - recordedAt > PROGRESS_INTERVAL_MS) {
        record('running')
        recordedAt = performance.now()
      }
    }
    // Some interrupted statements return a result rather than an error (MariaDB's BENCHMARK()), so
    // a run with a cancel asked for is cancelled even if its last statement succeeded.
    record(cancelled.has(id) ? 'cancelled' : 'done')
  } finally {
    cancelled.delete(id)
    // A run that got going and finished (not one whose tab closed, or that couldn't connect).
    if (started && finalState !== 'running') {
      const durationMs = performance.now() - started
      remember(connectionId, historyEntry(tab.sql, statements, ran, finalState, durationMs))
    }
  }
}

// Stops the tab's run: the running statement is cancelled on the server, and no more start. While
// the tab's session is still opening, the run stops once it has opened.
export function cancelRun(tabId: string): void {
  const tab = queryTab(tabId)
  const run = tab?.run
  if (!tab || run?.state !== 'running' || cancelled.has(run.id)) return
  cancelled.add(run.id)
  useTabs.getState().setRun(tabId, { ...run, cancelling: true, cancelError: undefined })
  if (!tab.sessionId) return
  window.api.db.cancel(tab.sessionId).catch((err: Error) => {
    // The run goes on; let the user try again.
    cancelled.delete(run.id)
    const current = queryTab(tabId)?.run
    if (current?.id === run.id && current.state === 'running') {
      useTabs.getState().setRun(tabId, { ...current, cancelling: false, cancelError: err.message })
    }
  })
}

// For a query tab being closed: closes its session, which stops a query still running there. The
// tabs of an in-memory SQLite database share the connection's session, which stays open, so there
// it only cancels the tab's run.
export function endSession(connectionId: string, tabId: string): void {
  const sessionId = queryTab(tabId)?.sessionId
  if (!sessionId) return
  if (sessionId === connectionId) cancelRun(tabId)
  else closeQuietly(sessionId)
}
