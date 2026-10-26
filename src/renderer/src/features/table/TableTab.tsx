import { useEffect, useState } from 'react'
import type { ColumnInfo } from '@shared/types'
import type { TableTabState } from '@renderer/store/tabs'

type Loaded = { columns: ColumnInfo[] } | { error: string }

// The table's columns for now; step 10 adds its rows in a grid.
export function TableTab({
  tab,
  connectionId
}: {
  tab: TableTabState
  connectionId: string
}): React.JSX.Element {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
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
  }, [connectionId, schema, name])

  return (
    <div className="h-full overflow-auto bg-surface">
      <div className="px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold select-text">
          {schema && <span className="font-normal text-muted">{schema}.</span>}
          {name}
        </h2>
        {loaded && 'columns' in loaded && (
          <p className="text-[12px] text-muted">
            {loaded.columns.length} {loaded.columns.length === 1 ? 'column' : 'columns'}
          </p>
        )}
      </div>
      {loaded === null && <p className="px-5 text-[12px] text-muted">Loading columns…</p>}
      {loaded && 'error' in loaded && (
        <p className="px-5 text-[12px] text-danger select-text">{loaded.error}</p>
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
