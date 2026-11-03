import { useEffect, useMemo, useState } from 'react'
import type {
  CellContextMenuEvent,
  ColDef,
  RowDataUpdatedEvent,
  SelectionChangedEvent,
  SortChangedEvent
} from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { countSql, selectPageSql, type Order } from '@shared/sql'
import type { ColumnInfo, DbType } from '@shared/types'
import {
  DEFAULT_COL_DEF,
  formatCell,
  gridTheme,
  ROW_SELECTION,
  selectFocusedRow,
  sizeColumns
} from '@renderer/components/grid'
import { NextIcon, PreviousIcon, RefreshIcon } from '@renderer/components/icons'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@renderer/components/shadcn/context-menu'
import { Button, IconButton } from '@renderer/components/ui'
import { useSession } from '@renderer/store/session'
import { useTabs, type RowEdit, type TableTabState } from '@renderer/store/tabs'
import { editable, rowKey, saveEdits } from './edits'
import { FilterBar } from './FilterBar'

// Rows a page shows. One more is asked for, to tell whether there's a next page.
const PAGE_SIZE = 100

// A page as it arrived, with the request it answers (so a newer request shows as loading).
type Page =
  | { request: string; columns: string[]; rows: unknown[][]; more: boolean }
  | { request: string; error: string }

// A row as the grid has it: its identity (primary key values as JSON, or its place in a table
// without one), its values as read, its values with unsaved changes applied, and which columns
// those changed.
interface GridRow {
  id: string
  read: unknown[]
  values: unknown[]
  changed: Set<string>
}

// The cell a right-click was on, for the cell menu.
interface MenuCell {
  row: GridRow
  column: string
  index: number
}

// Records a cell's new value in the tab's changes (or with `value` undefined, undoes its change; a
// value back to what was read is no change). Reads the changes as they are when called, since the
// grid calls this from callbacks made when its columns were.
function setCell(
  tabId: string,
  keyColumns: string[],
  names: string[],
  row: GridRow,
  column: string,
  value: string | null | undefined
): void {
  const { tabs, updateTable } = useTabs.getState()
  const tab = tabs.find((t) => t.id === tabId)
  if (tab?.type !== 'table') return
  const edits: Record<string, RowEdit> = { ...tab.edits }
  const current = edits[row.id] ?? {
    key: keyColumns.map((c) => ({ column: c, value: row.read[names.indexOf(c)] })),
    changes: {}
  }
  const changes = { ...current.changes }
  if (value === undefined || value === editable(row.read[names.indexOf(column)])) {
    delete changes[column]
  } else changes[column] = value
  if (Object.keys(changes).length) edits[row.id] = { ...current, changes }
  else delete edits[row.id]
  updateTable(tabId, { edits: Object.keys(edits).length ? edits : undefined })
}

// The table tab's rows: a page at a time, in the order and with the filter the tab keeps, run on
// the connection's own session. Sorting a column asks the database for that order (from the first
// page); without one, rows are in primary key order. `columns` is the table's columns, or null
// while they load (the primary key decides the order, so the first page waits for them).
//
// A table with a primary key can be edited: double-click a cell, or press Enter or start typing.
// Changes stay in the tab (by row key, so through paging, sorting and filtering) until Save, which
// applies them in one transaction, or Discard. A right-click on a cell can copy it, set it to
// NULL, or undo its change.
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
  const selectRow = useTabs((s) => s.selectRow)
  const [page, setPage] = useState<Page | null>(null)
  const [reloads, setReloads] = useState(0)
  const [count, setCount] = useState<{ request: string; value: number | string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuCell, setMenuCell] = useState<MenuCell | null>(null)

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
  // A page that couldn't be read tries again when the connection comes back. One that could stays,
  // with its selected row and scroll position.
  const reconnects = useSession((s) => s.reconnects)
  const retry = page !== null && 'error' in page ? reconnects : 0

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
  }, [connectionId, request, reloads, retry])

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
  const first = tab.page * PAGE_SIZE
  const names = useMemo(() => shown?.columns ?? [], [shown])
  // Editable with a primary key whose columns are all in the rows (a view has none).
  const keyIndexes = keyColumns?.map((c) => names.indexOf(c)) ?? []
  const canEdit = keyIndexes.length > 0 && keyIndexes.every((i) => i >= 0)
  const keyIndexesJson = JSON.stringify(keyIndexes)

  const rows = useMemo((): GridRow[] => {
    const indexes = JSON.parse(keyIndexesJson) as number[]
    return (shown?.rows ?? []).map((read, i) => {
      const id = canEdit ? rowKey(indexes.map((k) => read[k])) : String(first + i)
      const changes = tab.edits?.[id]?.changes ?? {}
      const changed = new Set(Object.keys(changes))
      const values = changed.size
        ? read.map((v, c) => (changed.has(names[c]) ? changes[names[c]] : v))
        : read
      return { id, read, values, changed }
    })
  }, [shown, canEdit, keyIndexesJson, first, tab.edits, names])

  const changeCell = (row: GridRow, column: string, value: string | null | undefined): void => {
    if (keyColumns) setCell(tab.id, keyColumns, names, row, column, value)
  }

  const columnDefs = useMemo(
    () =>
      names.map((name, i): ColDef<GridRow> => {
        const info = columns?.find((c) => c.name === name)
        return {
          colId: String(i),
          headerName: name,
          headerTooltip: info
            ? `${name}: ${info.dataType}${info.primaryKey ? ', primary key' : ''}`
            : name,
          // As text (JSON as its text), except bytes, which show as hex and aren't editable.
          valueGetter: (p) => {
            const value = p.data?.values[i]
            return value instanceof Uint8Array ? value : editable(value)
          },
          valueFormatter: (p) => formatCell(p.value),
          cellClassRules: {
            'cell-null': (p) => p.value === null || p.value === undefined,
            'cell-changed': (p) => p.data?.changed.has(name) ?? false
          },
          editable: (p) => canEdit && !(p.data?.read[i] instanceof Uint8Array),
          valueSetter: (p) => {
            const value = (p.newValue as string | null) ?? null
            if (p.data && keyColumns) setCell(tab.id, keyColumns, names, p.data, name, value)
            return false
          },
          // The database sorts; the grid only shows which column and which way.
          comparator: () => 0,
          sort: tab.order?.column === name ? tab.order.direction : null
        }
      }),
    [names, columns, tab.order, canEdit, keyColumns, tab.id]
  )

  const onSortChanged = (e: SortChangedEvent): void => {
    const sorted = e.api.getColumnState().find((c) => c.sort)
    const name = sorted && names[Number(sorted.colId)]
    const next = name && sorted.sort ? { column: name, direction: sorted.sort } : undefined
    if (next?.column === tab.order?.column && next?.direction === tab.order?.direction) return
    updateTable(tab.id, { order: next, page: 0 })
  }

  const onCellContextMenu = (e: CellContextMenuEvent<GridRow>): void => {
    const index = Number(e.column.getColId())
    if (e.data) setMenuCell({ row: e.data, column: names[index], index })
  }

  // The Row panel shows the row with its unsaved changes.
  const showRow = (row: GridRow | undefined): void =>
    selectRow(tab.id, row && { id: row.id, columns: names, values: row.values })

  const onSelectionChanged = (e: SelectionChangedEvent<GridRow>): void =>
    showRow(e.api.getSelectedRows()[0])

  // A page arrived or a cell changed, so the selected row's values may be new; the grid keeps it
  // selected by its id. A tab that comes back gets a new grid: it selects the same row again and
  // shows it. Without the row (it isn't on the page any more) there's nothing to show.
  const onRowDataUpdated = (e: RowDataUpdatedEvent<GridRow>): void => {
    const id = tab.selectedRow?.id
    if (loading || id === undefined) return
    const node = e.api.getRowNode(id)
    if (node && !node.isSelected()) {
      node.setSelected(true)
      e.api.ensureNodeVisible(node, 'middle')
    }
    showRow(node?.data)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      if (await saveEdits(tab.id)) setReloads((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }

  const total = count?.request === countRequest ? count.value : null
  const changedRows = Object.keys(tab.edits ?? {}).length
  const filterColumns = columns?.length ? columns.map((c) => c.name) : names
  const menuColumn = menuCell && columns?.find((c) => c.name === menuCell.column)
  const menuValue = menuCell?.row.values[menuCell.index]
  const menuEditable =
    !!menuCell && canEdit && !(menuCell.row.read[menuCell.index] instanceof Uint8Array)

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
          // A right-click on a cell opens its menu; anywhere else in the grid, nothing.
          <ContextMenu
            open={menuOpen && menuCell !== null}
            onOpenChange={(open) => setMenuOpen(open)}
          >
            <ContextMenuTrigger className="h-full" onContextMenuCapture={() => setMenuCell(null)}>
              <AgGridReact<GridRow>
                theme={gridTheme}
                rowData={rows}
                getRowId={(p) => p.data.id}
                columnDefs={columnDefs}
                defaultColDef={DEFAULT_COL_DEF}
                loading={loading}
                rowSelection={ROW_SELECTION}
                onCellFocused={selectFocusedRow}
                onSelectionChanged={onSelectionChanged}
                onRowDataUpdated={onRowDataUpdated}
                onFirstDataRendered={sizeColumns}
                onSortChanged={onSortChanged}
                onCellContextMenu={onCellContextMenu}
                sortingOrder={['asc', 'desc', null]}
                stopEditingWhenCellsLoseFocus
                overlayNoRowsTemplate={
                  tab.filter
                    ? '<span>No rows match the filter.</span>'
                    : '<span>This table has no rows.</span>'
                }
                enableCellTextSelection
                ensureDomOrder
                suppressDragLeaveHidesColumns
              />
            </ContextMenuTrigger>
            {menuCell && (
              <ContextMenuContent aria-label={`${menuCell.column} cell`}>
                <ContextMenuItem
                  onClick={() => {
                    const value =
                      menuValue instanceof Uint8Array ? formatCell(menuValue) : editable(menuValue)
                    navigator.clipboard.writeText(value ?? '').catch(() => {})
                  }}
                >
                  Copy value
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  disabled={!menuEditable || menuValue === null || menuColumn?.nullable === false}
                  onClick={() => changeCell(menuCell.row, menuCell.column, null)}
                >
                  Set to NULL
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={!menuCell.row.changed.has(menuCell.column)}
                  onClick={() => changeCell(menuCell.row, menuCell.column, undefined)}
                >
                  Undo change
                </ContextMenuItem>
              </ContextMenuContent>
            )}
          </ContextMenu>
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
        {keyColumns && !canEdit && shown && (
          <span title="Rows can be changed only in a table with a primary key, which finds them">
            · Read-only: no primary key
          </span>
        )}
        {changedRows > 0 && (
          <span className="ml-2 flex items-center gap-2 text-ink">
            {saving ? 'Saving…' : `${changedRows} ${changedRows === 1 ? 'row' : 'rows'} changed`}
            <Button
              disabled={saving}
              onClick={() => updateTable(tab.id, { edits: undefined })}
              className="h-6"
            >
              Discard
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => void save()} className="h-6">
              Save
            </Button>
          </span>
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
