import { useEffect, useState } from 'react'
import type { ColumnInfo } from '@shared/types'
import { Segmented } from '@renderer/components/ui'
import { useSession } from '@renderer/store/session'
import { useTabs, type TableTabState, type TableView } from '@renderer/store/tabs'
import { TableData } from './TableData'

type Loaded = { columns: ColumnInfo[] } | { error: string }

const VIEWS: { value: TableView; label: string }[] = [
  { value: 'data', label: 'Data' },
  { value: 'structure', label: 'Structure' }
]

// A table's tab: its rows (TableData) or its columns, as the switch in the header chooses. The
// columns load either way, since the rows' order and the grid's headers use them.
export function TableTab({
  tab,
  connectionId
}: {
  tab: TableTabState
  connectionId: string
}): React.JSX.Element {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const type = useSession((s) => s.session?.type ?? 'postgres')
  const reconnects = useSession((s) => s.reconnects)
  const updateTable = useTabs((s) => s.updateTable)
  const { schema, name } = tab.table

  useEffect(() => {
    let current = true
    window.api.db.listColumns(connectionId, { schema, name }).then(
      (columns) => current && setLoaded({ columns }),
      (err: Error) => current && setLoaded({ error: err.message })
    )
    return () => {
      current = false
    }
  }, [connectionId, schema, name, reconnects])

  const columns = loaded && 'columns' in loaded ? loaded.columns : null

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-3">
        <h2 className="min-w-0 truncate font-semibold select-text">
          {schema && <span className="font-normal text-muted">{schema}.</span>}
          {name}
        </h2>
        {columns && (
          <span className="shrink-0 text-[12px] text-muted">
            {columns.length} {columns.length === 1 ? 'column' : 'columns'}
          </span>
        )}
        <div className="ml-auto">
          <Segmented
            legend="Show"
            hideLegend
            name={`table-view-${tab.id}`}
            value={tab.view}
            options={VIEWS}
            onChange={(view) => updateTable(tab.id, { view })}
          />
        </div>
      </div>
      {tab.view === 'data' ? (
        <TableData
          tab={tab}
          connectionId={connectionId}
          type={type}
          // If the columns can't be read, the rows still can, just without primary key order.
          columns={loaded && 'error' in loaded ? [] : columns}
        />
      ) : (
        <TableStructure loaded={loaded} />
      )}
    </div>
  )
}

function TableStructure({ loaded }: { loaded: Loaded | null }): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {loaded === null && <p className="px-5 py-3 text-[12px] text-muted">Loading columns…</p>}
      {loaded && 'error' in loaded && (
        <p className="px-5 py-3 text-[12px] text-danger select-text">{loaded.error}</p>
      )}
      {loaded && 'columns' in loaded && (
        <table className="w-full border-collapse text-left select-text">
          <thead className="sticky top-0 bg-surface text-[12px] text-muted">
            <tr>
              {['Column', 'Type', 'Nullable', 'Default', 'Primary key'].map((heading) => (
                <th key={heading} className="px-5 py-1.5 font-normal first:pl-5">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loaded.columns.map((c) => (
              <tr key={c.name} className="border-t border-line">
                <td className="px-5 py-1 font-medium">{c.name}</td>
                <td className="px-5 py-1 font-mono text-[12px]">{c.dataType}</td>
                <td className="px-5 py-1 text-muted">{c.nullable ? 'Yes' : 'No'}</td>
                <td className="max-w-80 truncate px-5 py-1 font-mono text-[12px] text-muted">
                  {c.defaultValue}
                </td>
                <td className="px-5 py-1">{c.primaryKey ? 'Yes' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
