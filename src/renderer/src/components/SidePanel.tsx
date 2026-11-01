import { useRef, type ReactNode } from 'react'
import { SIDE_PANELS, useLayout, type SidePanelId } from '@renderer/store/layout'

// The main area beside the side panels keeps at least this width: dragging a panel wider stops
// there, and in a narrower window the panels shrink first (down to their minimums).
const FILL_MIN = 400
// How far an arrow key moves a panel's edge, in pixels.
const KEY_STEP = 16

// The main area, which the side panels beside it take their space from. It's isolated, so
// z-indexes inside it (CodeMirror's gutter has one) stay under the panels' drag handles.
export function MainArea({
  className = '',
  children
}: {
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <main data-fill className={`flex-1 isolate ${className}`} style={{ minWidth: FILL_MIN }}>
      {children}
    </main>
  )
}

// The widest a panel can be now: its width plus what the main area can spare.
function maxWidth(panel: HTMLElement): number {
  const fill = panel.parentElement?.querySelector(':scope > [data-fill]')
  const spare = fill ? fill.getBoundingClientRect().width - FILL_MIN : Infinity
  return panel.getBoundingClientRect().width + Math.max(0, spare)
}

// A panel at the left or right of the window whose inner edge (the line between it and the main
// area) drags to resize it. Focused, the edge moves with the arrow keys; double-clicking it
// restores the default width. Its width is in the layout store, so it is kept between launches.
export function SidePanel({
  id,
  side,
  label,
  resizeLabel,
  className = '',
  children
}: {
  id: SidePanelId
  side: 'left' | 'right'
  // The panel's accessible name, if it needs one.
  label?: string
  // The edge's accessible name, e.g. "Resize the tables list".
  resizeLabel: string
  className?: string
  children: ReactNode
}): React.JSX.Element {
  const { width: defaultWidth, min } = SIDE_PANELS[id]
  const width = Math.max(
    min,
    useLayout((s) => s.widths[id])
  )
  const setWidth = useLayout((s) => s.setWidth)
  // Where a drag started: the pointer's x, the panel's width then and the most it can take.
  const drag = useRef<{ x: number; width: number; max: number } | null>(null)

  const resize = (to: number, max: number): void =>
    setWidth(id, Math.round(Math.max(min, Math.min(max, to))))

  return (
    <aside
      aria-label={label}
      style={{ width, minWidth: min }}
      className={`relative flex flex-col border-line bg-sunken ${side === 'left' ? 'border-r' : 'border-l'} ${className}`}
    >
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={resizeLabel}
        aria-valuenow={width}
        aria-valuemin={min}
        aria-valuetext={`${width} pixels wide`}
        tabIndex={0}
        onPointerDown={(e) => {
          const panel = e.currentTarget.parentElement
          if (!panel) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = {
            x: e.clientX,
            width: panel.getBoundingClientRect().width,
            max: maxWidth(panel)
          }
        }}
        onPointerMove={(e) => {
          const start = drag.current
          if (!start || !e.currentTarget.hasPointerCapture(e.pointerId)) return
          const moved = side === 'left' ? e.clientX - start.x : start.x - e.clientX
          resize(start.width + moved, start.max)
        }}
        onLostPointerCapture={() => {
          drag.current = null
        }}
        onDoubleClick={(e) => {
          const panel = e.currentTarget.parentElement
          if (panel) resize(defaultWidth, maxWidth(panel))
        }}
        onKeyDown={(e) => {
          const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
          const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight'
          const panel = e.currentTarget.parentElement
          if (!panel || (e.key !== grow && e.key !== shrink)) return
          e.preventDefault()
          const now = panel.getBoundingClientRect().width
          resize(now + (e.key === grow ? KEY_STEP : -KEY_STEP), maxWidth(panel))
        }}
        // A strip 7px wide over the panel's border, reaching 3px past it on either side.
        className={`focus-ring absolute inset-y-0 z-10 w-[7px] cursor-col-resize ${
          side === 'left' ? '-right-[4px]' : '-left-[4px]'
        }`}
      />
    </aside>
  )
}
