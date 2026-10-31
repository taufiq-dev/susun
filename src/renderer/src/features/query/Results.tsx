import { ResultGrid } from '@renderer/components/ResultGrid'
import type { QueryRun } from '@renderer/store/tabs'

function count(n: number, noun: string): string {
  return `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`
}

function duration(ms: number): string {
  if (ms < 1) return '<1 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

// One line about the last run, for the bar between the editor and the results.
export function RunStatus({ run }: { run?: QueryRun }): React.JSX.Element | null {
  if (!run) return null
  if (run.state === 'running') return <span className="text-muted">Running…</span>
  if (run.state === 'failed') return <span className="text-danger">Failed</span>
  const { columns, rows, rowCount, durationMs } = run.result
  const what = columns.length > 0 ? count(rows.length, 'row') : `${count(rowCount, 'row')} changed`
  return (
    <span className="text-muted">
      {what} in {duration(durationMs)}
    </span>
  )
}

function Message({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-muted">
      {children}
    </div>
  )
}

export function Results({
  run,
  shortcut
}: {
  run?: QueryRun
  shortcut: string
}): React.JSX.Element {
  if (!run) {
    return (
      <Message>
        Press {shortcut} to run the query. With text selected, only the selection runs.
      </Message>
    )
  }
  if (run.state === 'running') return <Message>Running…</Message>
  if (run.state === 'failed') {
    return (
      <div className="h-full overflow-auto px-4 py-3">
        <p className="mb-1 font-medium text-danger">The query failed</p>
        <pre className="font-mono text-[12px] whitespace-pre-wrap text-ink select-text">
          {run.error}
        </pre>
      </div>
    )
  }
  if (run.result.columns.length === 0) return <Message>The statement returned no rows.</Message>
  // A new grid for each run, so its columns are sized to the new result.
  return <ResultGrid key={run.id} columns={run.result.columns} rows={run.result.rows} />
}
