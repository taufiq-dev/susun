import { Fragment, useRef } from 'react'
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

interface Props {
  connectionId: string
  dbType: DbType
}

// The tab area: the pane tree from the tabs store (see store/panes.ts).
export function Panes(props: Props): React.JSX.Element {
  const root = useTabs((s) => s.root)
  return <LayoutView node={root} {...props} />
}

function LayoutView({ node, ...props }: Props & { node: LayoutNode }): React.JSX.Element {
  return node.type === 'pane' ? (
    <PaneView pane={node} {...props} />
  ) : (
    <SplitView split={node} {...props} />
  )
}

function SplitView({ split, ...props }: Props & { split: Split }): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const resize = useTabs((s) => s.resize)
  const row = split.direction === 'row'
  // Where the boundary before child i is, as a share of the split.
  const boundary = (i: number): number => split.sizes.slice(0, i).reduce((a, b) => a + b, 0)

  // Moves the boundary before child i to `at`, keeping both of its neighbours at least MIN_PANE
  // (or half their space, if that's less).
  const moveBoundary = (i: number, at: number): void => {
    const rect = container.current?.getBoundingClientRect()
    if (!rect) return
    const length = row ? rect.width : rect.height
    const start = boundary(i - 1)
    const pair = split.sizes[i - 1] + split.sizes[i]
    const min = Math.min(MIN_PANE[split.direction] / length, pair / 2)
    const first = Math.min(pair - min, Math.max(min, at - start))
    const sizes = [...split.sizes]
    sizes[i - 1] = first
    sizes[i] = pair - first
    resize(split.id, sizes)
  }

  const pointerAt = (e: React.PointerEvent): number => {
    const rect = container.current?.getBoundingClientRect()
    if (!rect) return 0
    return row ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height
  }

  return (
    <div ref={container} className={`flex min-h-0 min-w-0 flex-1 ${row ? 'flex-row' : 'flex-col'}`}>
      {split.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && (
            <div className={`relative shrink-0 bg-line ${row ? 'w-px' : 'h-px'}`}>
              {/* Drag, or focus and use the arrow keys, to share the space between two panes. */}
              <div
                role="separator"
                aria-orientation={row ? 'vertical' : 'horizontal'}
                aria-label="Resize panes"
                aria-valuenow={Math.round(boundary(i) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                tabIndex={0}
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.currentTarget.setPointerCapture(e.pointerId)
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    moveBoundary(i, pointerAt(e))
                  }
                }}
                onKeyDown={(e) => {
                  const back = row ? 'ArrowLeft' : 'ArrowUp'
                  const forward = row ? 'ArrowRight' : 'ArrowDown'
                  if (e.key !== back && e.key !== forward) return
                  e.preventDefault()
                  moveBoundary(i, boundary(i) + (e.key === forward ? KEY_STEP : -KEY_STEP))
                }}
                className={`focus-ring absolute z-10 ${
                  row
                    ? 'inset-y-0 -left-[3px] w-[7px] cursor-col-resize'
                    : 'inset-x-0 -top-[3px] h-[7px] cursor-row-resize'
                }`}
              />
            </div>
          )}
          <div className="flex min-h-0 min-w-0" style={{ flex: `${split.sizes[i]} 1 0px` }}>
            <LayoutView node={child} {...props} />
          </div>
        </Fragment>
      ))}
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
