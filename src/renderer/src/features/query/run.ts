import { useTabs } from '@renderer/store/tabs'

let lastRunId = 0

// Runs `sql` for a query tab and records the outcome in the tabs store, so it isn't lost when the
// tab's component unmounts. Does nothing for blank SQL, or while the tab's last run is going.
export function runQuery(connectionId: string, tabId: string, sql: string): void {
  const { tabs, setRun } = useTabs.getState()
  const tab = tabs.find((t) => t.id === tabId)
  if (tab?.type !== 'query' || tab.run?.state === 'running' || !sql.trim()) return
  const id = ++lastRunId
  setRun(tabId, { id, state: 'running' })
  window.api.db.query(connectionId, sql).then(
    (result) => setRun(tabId, { id, state: 'done', result }),
    (err: Error) => setRun(tabId, { id, state: 'failed', error: err.message })
  )
}
