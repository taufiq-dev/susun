import { useMemo } from 'react'
import type { ColDef, FirstDataRenderedEvent, SelectionChangedEvent } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { useTabs } from '@renderer/store/tabs'
import {
  DEFAULT_COL_DEF,
  formatCell,
  gridTheme,
  ROW_SELECTION,
  selectFocusedRow,
  sizeColumns
} from './grid'

// A read-only grid of query rows. Rows are arrays in `columns` order, so each column reads its
// value by index: names can repeat (`select a.id, b.id`). The selected row goes in its tab, for the
// Row panel.
export function ResultGrid({
  tabId,
  columns,
  rows
}: {
  tabId: string
  columns: string[]
  rows: unknown[][]
}): React.JSX.Element {
  const columnDefs = useMemo(
    () =>
      columns.map((name, i): ColDef<unknown[]> => ({
        colId: String(i),
        headerName: name,
        headerTooltip: name,
        valueGetter: (p) => p.data?.[i],
        valueFormatter: (p) => formatCell(p.value),
        cellClassRules: { 'cell-null': (p) => p.value === null || p.value === undefined }
      })),
    [columns]
  )

  const onSelectionChanged = (e: SelectionChangedEvent<unknown[]>): void => {
    const values = e.api.getSelectedRows()[0]
    useTabs.getState().selectRow(tabId, values && { columns, values })
  }

  const onFirstDataRendered = (e: FirstDataRenderedEvent<unknown[]>): void => {
    sizeColumns(e)
    // A tab that comes back gets a new grid: it selects the same row again and shows it. The rows
    // are the ones in the store, so the row is that same array.
    const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
    const selected = tab?.selectedRow?.values
    if (!selected) return
    e.api.forEachNode((node) => {
      if (node.data !== selected) return
      node.setSelected(true)
      e.api.ensureNodeVisible(node, 'middle')
    })
  }

  return (
    <AgGridReact<unknown[]>
      theme={gridTheme}
      rowData={rows}
      columnDefs={columnDefs}
      defaultColDef={DEFAULT_COL_DEF}
      rowSelection={ROW_SELECTION}
      onCellFocused={selectFocusedRow}
      onSelectionChanged={onSelectionChanged}
      onFirstDataRendered={onFirstDataRendered}
      enableCellTextSelection
      ensureDomOrder
      suppressDragLeaveHidesColumns
    />
  )
}
