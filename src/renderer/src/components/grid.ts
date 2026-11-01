import { themeQuartz, type ColDef, type FirstDataRenderedEvent } from 'ag-grid-community'

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

export function formatCell(value: unknown): string {
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

// Fits each column to its contents, up to MAX_AUTO_WIDTH.
export function sizeColumns(e: FirstDataRenderedEvent): void {
  e.api.autoSizeAllColumns()
  const wide = (e.api.getColumns() ?? []).filter((c) => c.getActualWidth() > MAX_AUTO_WIDTH)
  e.api.setColumnWidths(wide.map((c) => ({ key: c, newWidth: MAX_AUTO_WIDTH })))
}
