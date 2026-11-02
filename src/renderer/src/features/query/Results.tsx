import { Fragment, useRef } from 'react'
import { ROW_LIMIT, type QueryResult } from '@shared/types'
import { ResultGrid } from '@renderer/components/ResultGrid'
import { moveFocus } from '@renderer/components/roving'
import { useRevealSelected } from '@renderer/components/useRevealSelected'
import type { QueryRun, StatementRun } from '@renderer/store/tabs'

// The statements list shows at most this many, the latest, so a long script stays quick to draw.
const LISTED_STATEMENTS = 500

type View = NonNullable<QueryRun['view']>

function count(n: number, noun: string): string {
  return `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`
}

function duration(ms: number): string {
  if (ms < 1) return '<1 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

// What a statement did, e.g. "500 rows", "Stopped after 10,000 rows", "First 10,000 of 52,300
// rows" or "3 rows changed".
function outcome(result: QueryResult): string {
  if (result.columns.length === 0) return `${count(result.rowCount ?? 0, 'row')} changed`
  if (!result.truncated) return count(result.rows.length, 'row')
  const kept = result.rows.length.toLocaleString()
  if (result.stopped) return `Stopped after ${kept} rows`
  return result.rowCount === null
    ? `First ${kept} rows`
    : `First ${kept} of ${count(result.rowCount, 'row')}`
}

// A tooltip for a result that was cut short.
function truncatedHint(result: QueryResult): string | undefined {
  if (!result.truncated) return undefined
  const limit = ROW_LIMIT.toLocaleString()
  if (result.stopped) {
    return (
      `Trowel keeps ${limit} rows of a result, so it stopped the query there: nothing past that ` +
      'point ran, including functions it would have called for later rows. Narrow it with WHERE ' +
      'or LIMIT to see other rows.'
    )
  }
  return `The statement ran to the end, but returned more rows than the ${limit} Trowel keeps.`
}

function returnsRows(s: StatementRun): boolean {
  return 'result' in s && s.result.columns.length > 0
}

function firstLine(sql: string): string {
  const end = sql.indexOf('\n')
  return end === -1 ? sql : `${sql.slice(0, end)} …`
}

// One line about the last run, for the bar between the editor and the results.
export function RunStatus({ run }: { run?: QueryRun }): React.JSX.Element | null {
  if (!run) return null
  const done = run.statements.length
  if (run.state === 'running') {
    if (run.cancelling) return <span className="text-muted">Cancelling…</span>
    if (run.connecting) return <span className="text-muted">Connecting…</span>
    return (
      <span className="text-muted">
        {run.total === 1 ? 'Running…' : `Running statement ${done + 1} of ${run.total}…`}
        {run.cancelError && (
          <span className="text-danger"> Couldn’t cancel: {run.cancelError}</span>
        )}
      </span>
    )
  }
  if (run.state === 'cancelled') {
    const last = run.statements[done - 1]
    return (
      <span className="text-muted">
        {run.total === 1 || done === 0
          ? 'Cancelled'
          : last && 'error' in last
            ? `Statement ${done} of ${run.total} cancelled`
            : `Cancelled after statement ${done} of ${run.total}`}
      </span>
    )
  }
  if (run.connectError) return <span className="text-danger">Couldn’t connect</span>
  if (run.state === 'failed') {
    return (
      <span className="text-danger">
        {run.total === 1
          ? 'Failed'
          : `Statement ${done} of ${run.total} failed, on line ${run.statements[done - 1].line}`}
      </span>
    )
  }
  const totalMs = run.statements.reduce(
    (ms, s) => ms + ('result' in s ? s.result.durationMs : 0),
    0
  )
  const first = run.statements[0]
  const single = run.total === 1 && 'result' in first ? first.result : undefined
  return (
    <span className="text-muted" title={single && truncatedHint(single)}>
      {single ? outcome(single) : count(done, 'statement')} in {duration(totalMs)}
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
  tabId,
  run,
  shortcut,
  onView,
  onShowStatement
}: {
  tabId: string
  run?: QueryRun
  shortcut: string
  onView: (view: View) => void
  // Selects a statement's text in the editor.
  onShowStatement: (from: number, to: number) => void
}): React.JSX.Element {
  if (!run) {
    return (
      <Message>
        Press {shortcut} to run the query, or select part of it to run just that. Statements run one
        at a time, stopping at the first error.
      </Message>
    )
  }
  if (run.connectError) {
    return (
      <ErrorPanel
        title="Couldn’t open a session for this tab, so nothing ran"
        error={run.connectError}
      />
    )
  }
  if (run.total === 1) return <SingleResult tabId={tabId} run={run} />
  return <ScriptResults tabId={tabId} run={run} onView={onView} onShowStatement={onShowStatement} />
}

function ErrorPanel({
  title,
  error,
  muted
}: {
  title: string
  error: string
  // For a cancelled query, which isn't a failure.
  muted?: boolean
}): React.JSX.Element {
  return (
    <div className="h-full overflow-auto px-4 py-3">
      <p className={`mb-1 font-medium ${muted ? '' : 'text-danger'}`}>{title}</p>
      <pre
        className={`font-mono text-[12px] whitespace-pre-wrap select-text ${muted ? 'text-muted' : 'text-ink'}`}
      >
        {error}
      </pre>
    </div>
  )
}

function SingleResult({ tabId, run }: { tabId: string; run: QueryRun }): React.JSX.Element {
  const s = run.statements[0]
  if (!s) {
    // Cancelled while the tab's session was opening.
    if (run.state === 'cancelled') return <Message>Cancelled before the query started.</Message>
    return <Message>Running…</Message>
  }
  if ('error' in s) {
    return s.cancelled ? (
      <ErrorPanel title="The query was cancelled" error={s.error} muted />
    ) : (
      <ErrorPanel title="The query failed" error={s.error} />
    )
  }
  if (s.result.columns.length === 0) return <Message>The statement returned no rows.</Message>
  // A new grid for each run, so its columns are sized to the new result.
  return <ResultGrid key={run.id} tabId={tabId} columns={s.result.columns} rows={s.result.rows} />
}

// A script's results: a tab for each statement that returned rows, and the list of statements.
function ScriptResults({
  tabId,
  run,
  onView,
  onShowStatement
}: {
  tabId: string
  run: QueryRun
  onView: (view: View) => void
  onShowStatement: (from: number, to: number) => void
}): React.JSX.Element {
  const withRows = run.statements.flatMap((s, i) => (returnsRows(s) ? [i] : []))
  // Until one is chosen: the last statement's rows once the script has finished (a script often
  // ends with the query it was written for), or else the list.
  const view: View =
    run.view ??
    (run.state === 'done' && withRows.length > 0 ? withRows[withRows.length - 1] : 'statements')
  const shown = typeof view === 'number' ? run.statements[view] : undefined
  const tabs = useRef<HTMLDivElement>(null)
  useRevealSelected(tabs, view)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-stretch border-b border-line px-1 select-none">
        <div
          ref={tabs}
          // One Tab stop; the arrow keys choose the result to show.
          onKeyDown={(e) =>
            moveFocus(e, e.currentTarget, '[role=tab]', 'horizontal', true)?.click()
          }
          role="tablist"
          aria-label="Results"
          className="flex min-w-0 overflow-x-auto"
        >
          {withRows.map((index, k) => (
            <ViewTab
              key={index}
              selected={view === index}
              title={`Line ${run.statements[index].line}: ${firstLine(run.statements[index].sql)}`}
              onClick={() => onView(index)}
            >
              Result {k + 1}
            </ViewTab>
          ))}
          <ViewTab selected={view === 'statements'} onClick={() => onView('statements')}>
            Statements
          </ViewTab>
        </div>
        {shown && 'result' in shown && (
          <span
            className="ml-auto self-center truncate px-2 text-[12px] text-muted"
            title={truncatedHint(shown.result)}
          >
            Line {shown.line}: {outcome(shown.result)} in {duration(shown.result.durationMs)}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {shown && 'result' in shown && shown.result.columns.length > 0 ? (
          <ResultGrid
            key={`${run.id}-${view}`}
            tabId={tabId}
            columns={shown.result.columns}
            rows={shown.result.rows}
          />
        ) : (
          <StatementList run={run} onView={onView} onShowStatement={onShowStatement} />
        )}
      </div>
    </div>
  )
}

function ViewTab({
  selected,
  title,
  onClick,
  children
}: {
  selected: boolean
  title?: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      title={title}
      onClick={onClick}
      className={`focus-ring shrink-0 px-2.5 text-[12px] whitespace-nowrap ${
        selected ? 'text-ink shadow-[inset_0_-2px_0_var(--accent)]' : 'text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

const LINK = 'focus-ring rounded-[3px] text-accent hover:underline'

function StatementList({
  run,
  onView,
  onShowStatement
}: {
  run: QueryRun
  onView: (view: View) => void
  onShowStatement: (from: number, to: number) => void
}): React.JSX.Element {
  const hidden = Math.max(0, run.statements.length - LISTED_STATEMENTS)
  const stopped = run.state === 'failed' || run.state === 'cancelled'
  const notRun = stopped ? run.total - run.statements.length : 0
  const last = run.statements[run.statements.length - 1]
  // Whether the run stopped at a statement (an error, or cancelled mid-statement) rather than
  // between two.
  const afterIt = last !== undefined && 'error' in last

  return (
    <div className="h-full overflow-auto text-[12px]">
      {hidden > 0 && (
        <p className="px-3 py-1.5 text-muted">{count(hidden, 'earlier statement')} not listed.</p>
      )}
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 bg-surface text-muted">
          <tr>
            <th className="py-1.5 pr-3 pl-3 font-normal">Line</th>
            <th className="w-full py-1.5 pr-3 font-normal">Statement</th>
            <th className="py-1.5 pr-3 font-normal">Result</th>
            <th className="py-1.5 pr-3 text-right font-normal">Time</th>
          </tr>
        </thead>
        <tbody>
          {run.statements.slice(hidden).map((s, k) => {
            const index = hidden + k
            return (
              <Fragment key={index}>
                <tr className="border-t border-line">
                  <td className="py-1 pr-3 pl-3 align-top tabular-nums">
                    <button
                      type="button"
                      title="Select this statement in the editor"
                      onClick={() => onShowStatement(s.from, s.to)}
                      className={LINK}
                    >
                      {s.line}
                    </button>
                  </td>
                  <td className="max-w-0 truncate py-1 pr-3 font-mono" title={s.sql.slice(0, 2000)}>
                    {firstLine(s.sql)}
                  </td>
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {'error' in s ? (
                      <span className={s.cancelled ? 'text-muted' : 'text-danger'}>
                        {s.cancelled ? 'Cancelled' : 'Failed'}
                      </span>
                    ) : s.result.columns.length > 0 ? (
                      <button
                        type="button"
                        title={truncatedHint(s.result)}
                        onClick={() => onView(index)}
                        className={LINK}
                      >
                        {outcome(s.result)}
                      </button>
                    ) : (
                      outcome(s.result)
                    )}
                  </td>
                  <td className="py-1 pr-3 text-right whitespace-nowrap text-muted tabular-nums">
                    {'result' in s && duration(s.result.durationMs)}
                  </td>
                </tr>
                {'error' in s && (
                  <tr>
                    <td />
                    <td colSpan={3} className="pr-3 pb-2">
                      <pre
                        className={`font-mono whitespace-pre-wrap select-text ${s.cancelled ? 'text-muted' : 'text-danger'}`}
                      >
                        {s.error}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {run.state === 'running' && (
        <p className="px-3 py-1.5 text-muted">
          Running statement {run.statements.length + 1} of {run.total}…
        </p>
      )}
      {notRun > 0 && (
        <p className="border-t border-line px-3 py-1.5 text-muted">
          {notRun === 1
            ? `The ${afterIt ? 'statement after it' : 'last statement'} didn’t run.`
            : afterIt
              ? `The ${notRun.toLocaleString()} statements after it didn’t run.`
              : `The last ${notRun.toLocaleString()} statements didn’t run.`}
        </p>
      )}
    </div>
  )
}
