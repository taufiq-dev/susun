import type { Statement } from '@shared/split'
import { useTabs, type QueryRun, type StatementRun } from '@renderer/store/tabs'

// While a script runs, its progress is written to the store at most this often, so a script of
// thousands of quick statements doesn't re-render for each one.
const PROGRESS_INTERVAL_MS = 100

let lastRunId = 0

function isOpen(tabId: string): boolean {
  return useTabs.getState().tabs.some((t) => t.id === tabId)
}

// Runs a query tab's statements one at a time, stopping at the first error, and records the run
// in the tabs store so it isn't lost when the tab's component unmounts. Does nothing without
// statements, or while the tab's last run is going. Stops if the tab is closed.
export async function runQuery(
  connectionId: string,
  tabId: string,
  statements: Statement[]
): Promise<void> {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
  if (tab?.type !== 'query' || tab.run?.state === 'running' || statements.length === 0) return

  const id = ++lastRunId
  const ran: StatementRun[] = []
  const record = (state: QueryRun['state']): void =>
    useTabs.getState().setRun(tabId, { id, state, total: statements.length, statements: [...ran] })

  record('running')
  let recordedAt = performance.now()
  for (const statement of statements) {
    if (!isOpen(tabId)) return
    try {
      ran.push({ ...statement, result: await window.api.db.query(connectionId, statement.sql) })
    } catch (err) {
      ran.push({ ...statement, error: (err as Error).message })
      record('failed')
      return
    }
    if (performance.now() - recordedAt > PROGRESS_INTERVAL_MS) {
      record('running')
      recordedAt = performance.now()
    }
  }
  record('done')
}
