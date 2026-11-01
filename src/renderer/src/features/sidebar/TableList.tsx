import { useEffect, useState } from 'react'
import type { TableInfo } from '@shared/types'
import { RefreshIcon } from '@renderer/components/icons'
import { SidePanel } from '@renderer/components/SidePanel'
import { Button, IconButton, TextInput } from '@renderer/components/ui'
import { focusedTab, sameTable, useTabs } from '@renderer/store/tabs'

type Loaded = { tables: TableInfo[] } | { error: string }

export function TableList({ connectionId }: { connectionId: string }): React.JSX.Element {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reloads, setReloads] = useState(0)
  const [filter, setFilter] = useState('')
  const openTable = useTabs((s) => s.openTable)
  // The focused pane's table, if it shows one.
  const activeTable = useTabs((s) => {
    const tab = focusedTab(s)
    return tab?.type === 'table' ? tab.table : null
  })

  useEffect(() => {
    let current = true
    window.api.db.listTables(connectionId).then(
      (tables) => current && setLoaded({ tables }),
      (err: Error) => current && setLoaded({ error: err.message })
    )
    return () => {
      current = false
    }
  }, [connectionId, reloads])

  const reload = (): void => {
    setLoaded(null)
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
        />
        <IconButton label="Reload tables" onClick={reload}>
          <RefreshIcon />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {loaded === null && <p className="px-3 text-[12px] text-muted">Loading tables…</p>}
        {loaded && 'error' in loaded && (
          <div className="flex flex-col items-start gap-2 px-3">
            <p className="text-[12px] text-danger select-text">{loaded.error}</p>
            <Button onClick={reload}>Try again</Button>
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
  return (
    <>
      {[...groups].map(([schema, all]) => {
        const matching = all.filter((t) => t.name.toLowerCase().includes(filter))
        if (matching.length === 0) return null
        return (
          <section key={schema}>
            {groups.size > 1 && (
              <h3 className="truncate px-3 pt-2 pb-0.5 text-[12px] text-muted">{schema}</h3>
            )}
            <ul>
              {matching.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
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
