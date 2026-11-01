import { useEffect, useMemo, useState } from 'react'
import type { ColDef, SortChangedEvent } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { countSql, selectPageSql, type Order } from '@shared/sql'
import type { ColumnInfo, DbType } from '@shared/types'
import { DEFAULT_COL_DEF, formatCell, gridTheme, sizeColumns } from '@renderer/components/grid'
import { NextIcon, PreviousIcon, RefreshIcon } from '@renderer/components/icons'
import { IconButton } from '@renderer/components/ui'
import { useTabs, type TableTabState } from '@renderer/store/tabs'
import { FilterBar } from './FilterBar'

// Rows a page shows. One more is asked for, to tell whether there's a next page.
const PAGE_SIZE = 100

// A page as it arrived, with the request it answers (so a newer request shows as loading).
type Page =
  | { request: string; columns: string[]; rows: unknown[][]; more: boolean }
  | { request: string; error: string }

// The table tab's rows: a page at a time, in the order and with the filter the tab keeps, run on
// the connection's own session. Sorting a column asks the database for that order (from the first
// page); without one, rows are in primary key order. `columns` is the table's columns, or null
// while they load (the primary key decides the order, so the first page waits for them).
export function TableData({
  tab,
  connectionId,
  type,
  columns
}: {
  tab: TableTabState
  connectionId: string
  type: DbType
  columns: ColumnInfo[] | null
}): React.JSX.Element {
  const updateTable = useTabs((s) => s.updateTable)
  const [page, setPage] = useState<Page | null>(null)
  const [reloads, setReloads] = useState(0)
  const [count, setCount] = useState<{ request: string; value: number | string } | null>(null)

  const keyColumns = useMemo(
    () => columns?.filter((c) => c.primaryKey).map((c) => c.name) ?? null,
    [columns]
  )
  const order: Order[] | null = tab.order
    ? [tab.order]
    : (keyColumns?.map((column) => ({ column, direction: 'asc' as const })) ?? null)
  // The request for this page, as a string, so the effect runs when (and only when) it changes.
  const request =
    order &&
    JSON.stringify(
      selectPageSql(type, tab.table, {
        filter: tab.filter,
        order,
        limit: PAGE_SIZE + 1,
        offset: tab.page * PAGE_SIZE
      })
    )
  const countRequest = JSON.stringify(countSql(type, tab.table, tab.filter))

  useEffect(() => {
    if (!request) return
    let current = true
    const { sql, params } = JSON.parse(request) as { sql: string; params: unknown[] }
    window.api.db.query(connectionId, sql, params).then(
      (result) => {
        if (!current) return
        setPage({
          request,
          columns: result.columns,
          rows: result.rows.slice(0, PAGE_SIZE),
          more: result.rows.length > PAGE_SIZE
        })
      },
      (err: Error) => current && setPage({ request, error: err.message })
    )
    return () => {
      current = false
    }
  }, [connectionId, request, reloads])

  const countRows = (): void => {
    const { sql, params } = JSON.parse(countRequest) as { sql: string; params: unknown[] }
    setCount({ request: countRequest, value: '…' })
    window.api.db.query(connectionId, sql, params).then(
      (result) => setCount({ request: countRequest, value: Number(result.rows[0]?.[0]) }),
      (err: Error) => setCount({ request: countRequest, value: `couldn’t count (${err.message})` })
    )
  }

  const loading = page === null || page.request !== request
  const shown = page && 'rows' in page ? page : null
  const columnNames = shown?.columns.join('\u0000') ?? ''

  const columnDefs = useMemo(
    () =>
      columnNames
        .split('\u0000')
        .filter(Boolean)
        .map((name, i): ColDef<unknown[]> => {
          const info = columns?.find((c) => c.name === name)
          return {
            colId: String(i),
            headerName: name,
            headerTooltip: info
              ? `${name}: ${info.dataType}${info.primaryKey ? ', primary key' : ''}`
              : name,
            valueGetter: (p) => p.data?.[i],
            valueFormatter: (p) => formatCell(p.value),
            cellClassRules: { 'cell-null': (p) => p.value === null || p.value === undefined },
            // The database sorts; the grid only shows which column and which way.
            comparator: () => 0,
            sort: tab.order?.column === name ? tab.order.direction : null
          }
        }),
    [columnNames, columns, tab.order]
  )

  const onSortChanged = (e: SortChangedEvent): void => {
    const sorted = e.api.getColumnState().find((c) => c.sort)
    const name = sorted && columnNames.split('\u0000')[Number(sorted.colId)]
    const next = name && sorted.sort ? { column: name, direction: sorted.sort } : undefined
    if (next?.column === tab.order?.column && next?.direction === tab.order?.direction) return
    updateTable(tab.id, { order: next, page: 0 })
  }

  const first = tab.page * PAGE_SIZE
  const total = count?.request === countRequest ? count.value : null

  const filterColumns = columns?.length ? columns.map((c) => c.name) : (shown?.columns ?? [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        columns={filterColumns}
        filter={tab.filter}
        onApply={(filter) => updateTable(tab.id, { filter, page: 0 })}
      />
      <div className="min-h-0 flex-1">
        {page && 'error' in page && page.request === request ? (
          <div className="h-full overflow-auto px-4 py-3">
            <p className="mb-1 font-medium text-danger">Couldn’t read the rows</p>
            <pre className="font-mono text-[12px] whitespace-pre-wrap select-text">
              {page.error}
            </pre>
          </div>
        ) : (
          <AgGridReact<unknown[]>
            theme={gridTheme}
            rowData={shown?.rows ?? []}
            columnDefs={columnDefs}
            defaultColDef={DEFAULT_COL_DEF}
            loading={loading}
            onFirstDataRendered={sizeColumns}
            onSortChanged={onSortChanged}
            sortingOrder={['asc', 'desc', null]}
            overlayNoRowsTemplate={
              tab.filter
                ? '<span>No rows match the filter.</span>'
                : '<span>This table has no rows.</span>'
            }
            enableCellTextSelection
            ensureDomOrder
            suppressDragLeaveHidesColumns
          />
        )}
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line bg-sunken pr-1 pl-3 text-[12px] text-muted select-none">
        <span role="status" className="tabular-nums">
          {loading
            ? 'Loading…'
            : !shown || shown.rows.length === 0
              ? tab.page > 0
                ? 'No rows on this page'
                : 'No rows'
              : `Rows ${(first + 1).toLocaleString()}–${(first + shown.rows.length).toLocaleString()}`}
          {typeof total === 'number' && ` of ${total.toLocaleString()}`}
          {typeof total === 'string' && ` (${total})`}
        </span>
        {total === null && (
          <button
            type="button"
            onClick={countRows}
            className="focus-ring rounded-[3px] text-accent hover:underline"
          >
            Count rows
          </button>
        )}
        <div className="ml-auto flex items-center">
          <IconButton
            label="Previous page"
            disabled={tab.page === 0 || loading}
            onClick={() => updateTable(tab.id, { page: tab.page - 1 })}
          >
            <PreviousIcon />
          </IconButton>
          <span className="min-w-12 text-center tabular-nums" aria-label={`Page ${tab.page + 1}`}>
            {tab.page + 1}
          </span>
          <IconButton
            label="Next page"
            disabled={!shown?.more || loading}
            onClick={() => updateTable(tab.id, { page: tab.page + 1 })}
          >
            <NextIcon />
          </IconButton>
          <IconButton label="Refresh" disabled={loading} onClick={() => setReloads((n) => n + 1)}>
            <RefreshIcon />
          </IconButton>
        </div>
      </div>
    </div>
  )
}
