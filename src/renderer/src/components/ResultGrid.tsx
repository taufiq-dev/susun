import { useMemo } from 'react'
import type { ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { DEFAULT_COL_DEF, formatCell, gridTheme, sizeColumns } from './grid'

// A read-only grid of query rows. Rows are arrays in `columns` order, so each column reads its
// value by index: names can repeat (`select a.id, b.id`).
export function ResultGrid({
  columns,
  rows
}: {
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

  return (
    <AgGridReact<unknown[]>
      theme={gridTheme}
      rowData={rows}
      columnDefs={columnDefs}
      defaultColDef={DEFAULT_COL_DEF}
      onFirstDataRendered={sizeColumns}
      enableCellTextSelection
      ensureDomOrder
      suppressDragLeaveHidesColumns
    />
  )
}
