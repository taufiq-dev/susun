import type { DbType } from '@shared/types'
import { Button } from '@renderer/components/ui'
import { QueryTab } from '@renderer/features/query/QueryTab'
import { TableTab } from '@renderer/features/table/TableTab'
import { panesOf, type LayoutNode, type Pane, type Split } from '@renderer/store/panes'
import { useTabs } from '@renderer/store/tabs'
import { TabBar } from './TabBar'

// Resizing doesn't make a pane narrower or shorter than this, in pixels. Splitting can (five panes
// side by side may be narrower), so it is small enough to leave room to resize those.
const MIN_PANE = { row: 160, column: 100 }
// How far an arrow key moves a boundary, as a share of the split.
const KEY_STEP = 0.05
// Shares of the tab area are compared with this much slack, as sums of sizes aren't exact.
const EPSILON = 1e-6

// A part of the tab area, as shares of its width and height.
interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// The boundary before child `index` of a split, drawn as a line across the split's rect.
interface Boundary {
  split: Split
  index: number
  rect: Rect
}

// Where each pane and boundary goes, from the tree.
function layout(
  node: LayoutNode,
  rect: Rect,
  panes: Map<string, Rect>,
  boundaries: Boundary[]
): void {
  if (node.type === 'pane') {
    panes.set(node.id, rect)
    return
  }
  const row = node.direction === 'row'
  let offset = 0
  node.children.forEach((child, i) => {
    if (i > 0) boundaries.push({ split: node, index: i, rect })
    const size = node.sizes[i]
    const childRect = row
      ? { x: rect.x + offset * rect.w, y: rect.y, w: size * rect.w, h: rect.h }
      : { x: rect.x, y: rect.y + offset * rect.h, w: rect.w, h: size * rect.h }
    layout(child, childRect, panes, boundaries)
    offset += size
  })
}

// Positions a rect in the tab area. A pane not at the area's left or top edge starts 1px later,
// leaving room for the boundary line there.
function place(rect: Rect): React.CSSProperties {
  const left = rect.x > EPSILON ? 1 : 0
  const top = rect.y > EPSILON ? 1 : 0
  return {
    left: `calc(${rect.x * 100}% + ${left}px)`,
    top: `calc(${rect.y * 100}% + ${top}px)`,
    width: `calc(${rect.w * 100}% - ${left}px)`,
    height: `calc(${rect.h * 100}% - ${top}px)`
  }
}

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 }

interface Props {
  connectionId: string
  dbType: DbType
}

// The tab area: the pane tree from the tabs store (see store/panes.ts). Panes are one flat list,
// keyed by id and placed by the tree, so splitting, resizing, maximizing or moving a pane never
// remounts it and its editor and grid keep their state (undo history, scroll, selection). While a
// pane is maximized the others stay mounted, hidden.
export function Panes(props: Props): React.JSX.Element {
  const root = useTabs((s) => s.root)
  const maximizedId = useTabs((s) => s.maximizedPaneId)
  const resize = useTabs((s) => s.resize)

  const rects = new Map<string, Rect>()
  const boundaries: Boundary[] = []
  layout(root, FULL, rects, boundaries)
  const panes = panesOf(root)

  // Moves a boundary to `at`, a share of its split, keeping both neighbours at least MIN_PANE (or
  // half their space, if that's less). `area` is the tab area's size on screen.
  const moveBoundary = ({ split, index, rect }: Boundary, at: number, area: DOMRect): void => {
    const length = split.direction === 'row' ? rect.w * area.width : rect.h * area.height
    const start = split.sizes.slice(0, index - 1).reduce((a, b) => a + b, 0)
    const pair = split.sizes[index - 1] + split.sizes[index]
    const min = Math.min(MIN_PANE[split.direction] / length, pair / 2)
    const first = Math.min(pair - min, Math.max(min, at - start))
    const sizes = [...split.sizes]
    sizes[index - 1] = first
    sizes[index] = pair - first
    resize(split.id, sizes)
  }

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      {panes.map((pane) => {
        const hidden = maximizedId !== null && pane.id !== maximizedId
        return (
          <div
            key={pane.id}
            className={`absolute ${hidden ? 'hidden' : 'flex'}`}
            style={place(pane.id === maximizedId ? FULL : (rects.get(pane.id) ?? FULL))}
          >
            <PaneView pane={pane} {...props} />
          </div>
        )
      })}
      {maximizedId === null &&
        boundaries.map((boundary) => (
          <BoundaryLine
            key={`${boundary.split.id}-${boundary.index}`}
            boundary={boundary}
            onMove={(at, area) => moveBoundary(boundary, at, area)}
          />
        ))}
    </div>
  )
}

// The tab area on screen, from the line's handle: the handle is in the line, the line in the area.
function areaOf(handle: HTMLElement): DOMRect | undefined {
  return handle.parentElement?.parentElement?.getBoundingClientRect()
}

function BoundaryLine({
  boundary,
  onMove
}: {
  boundary: Boundary
  onMove: (at: number, area: DOMRect) => void
}): React.JSX.Element {
  const { split, index, rect } = boundary
  const row = split.direction === 'row'
  // The boundary's position, as a share of its split.
  const at = split.sizes.slice(0, index).reduce((a, b) => a + b, 0)
  const line: React.CSSProperties = row
    ? {
        left: `${(rect.x + at * rect.w) * 100}%`,
        top: `${rect.y * 100}%`,
        height: `${rect.h * 100}%`
      }
    : {
        top: `${(rect.y + at * rect.h) * 100}%`,
        left: `${rect.x * 100}%`,
        width: `${rect.w * 100}%`
      }

  const pointerAt = (e: React.PointerEvent, area: DOMRect): number =>
    row
      ? (e.clientX - area.left - rect.x * area.width) / (rect.w * area.width)
      : (e.clientY - area.top - rect.y * area.height) / (rect.h * area.height)

  return (
    <div className={`absolute z-10 bg-line ${row ? 'w-px' : 'h-px'}`} style={line}>
      {/* Drag, or focus and use the arrow keys, to share the space between two panes. */}
      <div
        role="separator"
        aria-orientation={row ? 'vertical' : 'horizontal'}
        aria-label="Resize panes"
        aria-valuenow={Math.round(at * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const area = areaOf(e.currentTarget)
          if (area && e.currentTarget.hasPointerCapture(e.pointerId))
            onMove(pointerAt(e, area), area)
        }}
        onKeyDown={(e) => {
          const back = row ? 'ArrowLeft' : 'ArrowUp'
          const forward = row ? 'ArrowRight' : 'ArrowDown'
          const area = areaOf(e.currentTarget)
          if (!area || (e.key !== back && e.key !== forward)) return
          e.preventDefault()
          onMove(at + (e.key === forward ? KEY_STEP : -KEY_STEP), area)
        }}
        className={`focus-ring absolute ${
          row
            ? 'inset-y-0 -left-[3px] w-[7px] cursor-col-resize'
            : 'inset-x-0 -top-[3px] h-[7px] cursor-row-resize'
        }`}
      />
    </div>
  )
}

function PaneView({ pane, connectionId, dbType }: Props & { pane: Pane }): React.JSX.Element {
  const focused = useTabs((s) => s.focusedPaneId === pane.id)
  // Its number in reading order, or null when it is the only pane.
  const number = useTabs((s) =>
    s.root.type === 'pane' ? null : panesOf(s.root).findIndex((p) => p.id === pane.id) + 1
  )
  const active = useTabs((s) => s.tabs.find((t) => t.id === pane.activeId))
  const focusPane = useTabs((s) => s.focusPane)
  const openQuery = useTabs((s) => s.openQuery)

  return (
    <section
      data-pane={pane.id}
      data-focused={focused || undefined}
      aria-label={number ? `Pane ${number}` : undefined}
      // Clicking or tabbing into a pane makes it the one New query and the sidebar act on.
      onPointerDownCapture={() => focusPane(pane.id)}
      onFocusCapture={() => focusPane(pane.id)}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
    >
      <TabBar
        pane={pane}
        focused={focused}
        label={number ? `Tabs in pane ${number}` : 'Open tabs'}
      />
      <div className="min-h-0 flex-1">
        {active?.type === 'query' && (
          <QueryTab key={active.id} tab={active} connectionId={connectionId} dbType={dbType} />
        )}
        {active?.type === 'table' && (
          <TableTab key={active.id} tab={active} connectionId={connectionId} />
        )}
        {!active && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-muted">Open a table from the list, or start a new query.</p>
            <Button onClick={() => openQuery(pane.id)}>New query</Button>
          </div>
        )}
      </div>
    </section>
  )
}
