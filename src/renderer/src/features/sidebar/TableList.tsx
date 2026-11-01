import { useEffect, useRef, useState } from 'react'
import type { TableInfo } from '@shared/types'
import { RefreshIcon } from '@renderer/components/icons'
import { moveFocus } from '@renderer/components/roving'
import { SidePanel } from '@renderer/components/SidePanel'
import { Button, IconButton, TextInput } from '@renderer/components/ui'
import { focusedTab, sameTable, useTabs } from '@renderer/store/tabs'

type Loaded = { tables: TableInfo[] } | { error: string }

// The list's items. The list is one Tab stop (the open table, or else the first), and the arrow
// keys move through it.
const ITEM = 'button[data-table]'

export function TableList({ connectionId }: { connectionId: string }): React.JSX.Element {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reloads, setReloads] = useState(0)
  // A reload keeps the list it has (and its scroll position) until the new one arrives.
  const [reloading, setReloading] = useState(false)
  const [filter, setFilter] = useState('')
  const filterInput = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const openTable = useTabs((s) => s.openTable)
  // The focused pane's table, if it shows one.
  const activeTable = useTabs((s) => {
    const tab = focusedTab(s)
    return tab?.type === 'table' ? tab.table : null
  })

  useEffect(() => {
    let current = true
    window.api.db.listTables(connectionId).then(
      (tables) => {
        if (!current) return
        setLoaded({ tables })
        setReloading(false)
      },
      (err: Error) => {
        if (!current) return
        setLoaded({ error: err.message })
        setReloading(false)
      }
    )
    return () => {
      current = false
    }
  }, [connectionId, reloads])

  const reload = (): void => {
    setReloading(true)
    setReloads((n) => n + 1)
  }

  return (
    <SidePanel
      id="tables"
      side="left"
      label="Tables"
      resizeLabel="Resize the tables list"
      className="select-none"
    >
      <div className="flex items-center gap-1 p-2">
        <TextInput
          type="search"
          aria-label="Filter tables"
          placeholder="Filter tables"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          ref={filterInput}
          // Down goes into the list. Enter opens the table if only one matches, or else goes into
          // the list, where Enter opens the focused one.
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'Enter') return
            const items = list.current?.querySelectorAll<HTMLElement>(ITEM) ?? []
            if (items.length === 0) return
            e.preventDefault()
            if (e.key === 'Enter' && items.length === 1) items[0].click()
            else list.current?.querySelector<HTMLElement>(`${ITEM}[tabindex="0"]`)?.focus()
          }}
        />
        <IconButton label="Reload tables" onClick={reload} disabled={reloading}>
          <RefreshIcon />
        </IconButton>
      </div>
      <div
        ref={list}
        // Up from the first table goes back to the filter.
        onKeyDown={(e) => {
          if (!(e.target instanceof HTMLElement) || !e.target.matches(ITEM)) return
          if (e.key === 'ArrowUp' && e.target === e.currentTarget.querySelector(ITEM)) {
            e.preventDefault()
            filterInput.current?.focus()
            return
          }
          moveFocus(e, e.currentTarget, ITEM, 'vertical')
        }}
        className="min-h-0 flex-1 overflow-y-auto pb-2"
      >
        {loaded === null && <p className="px-3 text-[12px] text-muted">Loading tables…</p>}
        {loaded && 'error' in loaded && (
          <div className="flex flex-col items-start gap-2 px-3">
            <p className="text-[12px] text-danger select-text">{loaded.error}</p>
            <Button onClick={reload} disabled={reloading}>
              Try again
            </Button>
          </div>
        )}
        {loaded && 'tables' in loaded && (
          <Groups
            tables={loaded.tables}
            filter={filter.trim().toLowerCase()}
            isActive={(t) => activeTable !== null && sameTable(t, activeTable)}
            onOpen={openTable}
          />
        )}
      </div>
    </SidePanel>
  )
}

// Tables grouped by Postgres schema. The schema headings only show when there is more than one.
function Groups({
  tables,
  filter,
  isActive,
  onOpen
}: {
  tables: TableInfo[]
  filter: string
  isActive: (table: TableInfo) => boolean
  onOpen: (table: TableInfo) => void
}): React.JSX.Element {
  if (tables.length === 0) {
    return <p className="px-3 text-[12px] text-muted">This database has no tables or views.</p>
  }
  const groups = Map.groupBy(tables, (t) => t.schema ?? '')
  const shown = tables.filter((t) => t.name.toLowerCase().includes(filter))
  if (shown.length === 0) {
    return <p className="px-3 text-[12px] text-muted">No tables match “{filter}”.</p>
  }
  const matching = (all: TableInfo[]): TableInfo[] =>
    all.filter((t) => t.name.toLowerCase().includes(filter))
  // The list's Tab stop: the open table if it's shown, or else the first shown, in list order.
  const inOrder = [...groups.values()].flatMap(matching)
  const current = inOrder.find(isActive) ?? inOrder[0]
  return (
    <>
      {[...groups].map(([schema, all]) => {
        const listed = matching(all)
        if (listed.length === 0) return null
        return (
          <section key={schema}>
            {groups.size > 1 && (
              <h3 className="truncate px-3 pt-2 pb-0.5 text-[12px] text-muted">{schema}</h3>
            )}
            <ul>
              {listed.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    data-table
                    tabIndex={t === current ? 0 : -1}
                    title={t.schema ? `${t.schema}.${t.name}` : t.name}
                    onClick={() => onOpen(t)}
                    className={`focus-ring flex h-6 w-full items-center gap-2 px-3 text-left ${
                      isActive(t) ? 'bg-accent/15 text-ink' : 'hover:bg-surface/70'
                    }`}
                  >
                    <span className="truncate">{t.name}</span>
                    {t.type === 'view' && (
                      <span className="ml-auto shrink-0 text-[11px] text-muted">view</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <p className="px-3 pt-2 text-[11px] text-muted">
        {shown.length === tables.length
          ? `${tables.length} ${tables.length === 1 ? 'table' : 'tables'}`
          : `${shown.length} of ${tables.length}`}
      </p>
    </>
  )
}
