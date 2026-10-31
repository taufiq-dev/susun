import type { Statement } from '@shared/split'
import { useTabs, type QueryRun, type StatementRun } from '@renderer/store/tabs'

// While a script runs, its progress is written to the store at most this often, so a script of
// thousands of quick statements doesn't re-render for each one.
const PROGRESS_INTERVAL_MS = 100

let lastRunId = 0
// Runs that Cancel has been asked to stop.
const cancelled = new Set<number>()

function currentRun(tabId: string): QueryRun | undefined {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
  return tab?.type === 'query' ? tab.run : undefined
}

function isOpen(tabId: string): boolean {
  return useTabs.getState().tabs.some((t) => t.id === tabId)
}

// Runs a query tab's statements one at a time, stopping at the first error or at Cancel, and
// records the run in the tabs store so it isn't lost when the tab's component unmounts. Does
// nothing without statements, or while the tab's last run is going. Stops if the tab is closed.
export async function runQuery(
  connectionId: string,
  tabId: string,
  statements: Statement[]
): Promise<void> {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
  if (tab?.type !== 'query' || tab.run?.state === 'running' || statements.length === 0) return

  const id = ++lastRunId
  const ran: StatementRun[] = []
  // Keeps what the user changed meanwhile: the result shown, a failed cancel.
  const record = (state: QueryRun['state']): void => {
    const current = currentRun(tabId)
    useTabs.getState().setRun(tabId, {
      ...(current?.id === id ? current : {}),
      id,
      state,
      total: statements.length,
      statements: [...ran],
      cancelling: state === 'running' && cancelled.has(id)
    })
  }

  record('running')
  let recordedAt = performance.now()
  try {
    for (const statement of statements) {
      if (!isOpen(tabId)) return
      if (cancelled.has(id)) return record('cancelled')
      try {
        ran.push({ ...statement, result: await window.api.db.query(connectionId, statement.sql) })
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
  }
}

// Stops the tab's run: the running statement is cancelled on the server, and no more start.
export function cancelRun(connectionId: string, tabId: string): void {
  const run = currentRun(tabId)
  if (run?.state !== 'running' || cancelled.has(run.id)) return
  cancelled.add(run.id)
  useTabs.getState().setRun(tabId, { ...run, cancelling: true, cancelError: undefined })
  window.api.db.cancel(connectionId).catch((err: Error) => {
    // The run goes on; let the user try again.
    cancelled.delete(run.id)
    const current = currentRun(tabId)
    if (current?.id === run.id && current.state === 'running') {
      useTabs.getState().setRun(tabId, { ...current, cancelling: false, cancelError: err.message })
    }
  })
}
