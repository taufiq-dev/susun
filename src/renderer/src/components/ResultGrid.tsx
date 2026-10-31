import { useMemo } from 'react'
import { themeQuartz, type ColDef, type FirstDataRenderedEvent } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'

// The app's CSS variables, so the grid follows the OS theme and the workspace's accent.
const theme = themeQuartz.withParams({
  backgroundColor: 'var(--surface)',
  foregroundColor: 'var(--ink)',
  borderColor: 'var(--line)',
  chromeBackgroundColor: 'var(--sunken)',
  headerBackgroundColor: 'var(--sunken)',
  accentColor: 'var(--accent)',
  rowHoverColor: 'color-mix(in srgb, var(--ink) 4%, transparent)',
  selectedRowBackgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
  browserColorScheme: 'inherit',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 500,
  cellFontFamily: 'var(--font-mono)',
  cellFontSize: 12,
  rowHeight: 26,
  headerHeight: 30,
  cellHorizontalPadding: 8,
  columnBorder: true,
  headerColumnBorder: true,
  wrapperBorder: false,
  wrapperBorderRadius: 0
})

// Auto-sized columns stop at this width, so one long text value doesn't push the rest off screen.
// Dragging a column edge can still make it wider.
const MAX_AUTO_WIDTH = 360

const DEFAULT_COL_DEF: ColDef = { sortable: true, resizable: true, minWidth: 56 }

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (value instanceof Uint8Array) return hex(value)
  if (value instanceof Date) return value.toISOString()
  // Postgres and MySQL JSON columns arrive parsed.
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// The first 32 bytes, so a large blob doesn't become a megabyte-long string.
function hex(bytes: Uint8Array): string {
  const shown = bytes.subarray(0, 32)
  const digits = Array.from(shown, (b) => b.toString(16).padStart(2, '0')).join('')
  return `0x${digits}${bytes.length > shown.length ? '…' : ''}`
}

function sizeColumns(e: FirstDataRenderedEvent): void {
  e.api.autoSizeAllColumns()
  const wide = (e.api.getColumns() ?? []).filter((c) => c.getActualWidth() > MAX_AUTO_WIDTH)
  e.api.setColumnWidths(wide.map((c) => ({ key: c, newWidth: MAX_AUTO_WIDTH })))
}

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
      theme={theme}
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
