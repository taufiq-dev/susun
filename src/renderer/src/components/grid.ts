import {
  themeQuartz,
  type CellFocusedEvent,
  type ColDef,
  type FirstDataRenderedEvent,
  type RowSelectionOptions
} from 'ag-grid-community'
import { hex } from '@renderer/lib/hex'

// What the result grid (ResultGrid) and the table tab's grid share.

// The app's CSS variables, so the grid follows the OS theme and the workspace's accent.
export const gridTheme = themeQuartz.withParams({
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
export const MAX_AUTO_WIDTH = 360

export const DEFAULT_COL_DEF: ColDef = { sortable: true, resizable: true, minWidth: 56 }

// One selected row, the one the Row panel shows. It follows the focused cell (`selectFocusedRow`),
// so the arrow keys move it as well as clicks.
export const ROW_SELECTION: RowSelectionOptions = {
  mode: 'singleRow',
  checkboxes: false,
  enableClickSelection: false
}

export function selectFocusedRow(e: CellFocusedEvent): void {
  if (typeof e.rowIndex === 'number') e.api.getDisplayedRowAtIndex(e.rowIndex)?.setSelected(true)
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  // The first 32 bytes, so a large blob doesn't make a cell a megabyte long.
  if (value instanceof Uint8Array) return hex(value, 32)
  if (value instanceof Date) return value.toISOString()
  // Postgres and MySQL JSON columns arrive parsed.
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Fits each column to its contents, up to MAX_AUTO_WIDTH. The grid may put the sizing off until its
// cells have rendered, so the limit goes along with it rather than being applied afterwards.
export function sizeColumns(e: FirstDataRenderedEvent): void {
  e.api.autoSizeAllColumns({ defaultMaxWidth: MAX_AUTO_WIDTH })
}
