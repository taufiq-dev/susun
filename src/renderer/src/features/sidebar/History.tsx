import { useEffect, useRef, useState } from 'react'
import type { HistoryEntry } from '@shared/types'
import { TrashIcon } from '@renderer/components/icons'
import { moveFocus } from '@renderer/components/roving'
import { Button, IconButton, TextInput } from '@renderer/components/ui'
import { useLibrary } from '@renderer/store/library'
import { useTabs } from '@renderer/store/tabs'
import { duration, ranWhen } from './format'

type Loaded = { entries: HistoryEntry[] } | { error: string }

const ITEM = 'button[data-entry]'

// The sidebar's Recent queries view: this connection's runs, newest first (the last 1,000).
// Clicking one opens its SQL in a new query tab. Clearing asks for a second click.
export function History({ connectionId }: { connectionId: string }): React.JSX.Element {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [filter, setFilter] = useState('')
  const [confirmingClear, setConfirmingClear] = useState(false)
  const version = useLibrary((s) => s.history)
  const openQuery = useTabs((s) => s.openQuery)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current = true
    window.api.history.list(connectionId).then(
      (entries) => current && setLoaded({ entries }),
      (err: Error) => current && setLoaded({ error: err.message })
    )
    return () => {
      current = false
    }
  }, [connectionId, version])

  const clear = (): void => {
    setConfirmingClear(false)
    window.api.history.clear(connectionId).then(
      () => useLibrary.getState().historyChanged(),
      (err: Error) => setLoaded({ error: err.message })
    )
  }

  const needle = filter.trim().toLowerCase()
  const entries = loaded && 'entries' in loaded ? loaded.entries : []
  const shown = needle ? entries.filter((e) => e.sql.toLowerCase().includes(needle)) : entries

  return (
    <section aria-label="Recent queries" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 p-2">
        <TextInput
          type="search"
          aria-label="Filter recent queries"
          placeholder="Filter recent queries"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'Enter') return
            const first = list.current?.querySelector<HTMLElement>(ITEM)
            if (!first) return
            e.preventDefault()
            first.focus()
          }}
        />
        {confirmingClear ? (
          <Button
            variant="danger"
            onClick={clear}
            onBlur={() => setConfirmingClear(false)}
            autoFocus
          >
            Clear all
          </Button>
        ) : (
          <IconButton
            label="Clear recent queries"
            disabled={entries.length === 0}
            onClick={() => setConfirmingClear(true)}
          >
            <TrashIcon />
          </IconButton>
        )}
      </div>
      <div
        ref={list}
        onKeyDown={(e) => {
          if (e.target instanceof HTMLElement && e.target.matches(ITEM)) {
            moveFocus(e, e.currentTarget, ITEM, 'vertical')
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto pb-2"
      >
        {loaded === null && <p className="px-3 text-[12px] text-muted">Loading…</p>}
        {loaded && 'error' in loaded && (
          <p className="px-3 text-[12px] text-danger select-text">{loaded.error}</p>
        )}
        {loaded && 'entries' in loaded && entries.length === 0 && (
          <p className="px-3 text-[12px] text-muted">
            Queries you run on this connection show up here.
          </p>
        )}
        {entries.length > 0 && shown.length === 0 && (
          <p className="px-3 text-[12px] text-muted">No recent queries match “{filter.trim()}”.</p>
        )}
        <ul>
          {shown.map((entry, i) => (
            <li key={entry.id}>
              <button
                type="button"
                data-entry
                tabIndex={i === 0 ? 0 : -1}
                title={entry.sql.slice(0, 2000)}
                onClick={() => openQuery(undefined, entry.sql)}
                className="focus-ring flex w-full flex-col gap-0.5 border-b border-line/60 px-3 py-1.5 text-left hover:bg-surface/70"
              >
                <span className="line-clamp-2 font-mono text-[12px] break-all whitespace-pre-wrap">
                  {entry.sql}
                </span>
                <span className="flex gap-1.5 text-[11px] text-muted">
                  <span className="shrink-0" title={new Date(entry.ranAt).toLocaleString()}>
                    {ranWhen(entry.ranAt)}
                  </span>
                  <span aria-hidden>·</span>
                  <span
                    className={`min-w-0 truncate ${entry.status === 'failed' ? 'text-danger' : ''}`}
                  >
                    {entry.summary}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0 tabular-nums">{duration(entry.durationMs)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
