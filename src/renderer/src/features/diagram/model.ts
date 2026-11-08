import dagre from '@dagrejs/dagre'
import type { ColumnInfo, ForeignKeyInfo, TableInfo, TableRef } from '@shared/types'
import type { DiagramScope } from '@renderer/store/tabs'

// What an ER diagram shows and where: which tables, the foreign keys between them, each table's
// size, and the layout. Pure, so it can be tested; DiagramTab draws it with React Flow.

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

// A table's id in the diagram (its node id, and its key in a tab's `positions`).
export function tableKey(table: TableRef): string {
  return JSON.stringify([table.schema ?? null, table.name])
}

function same(a: TableRef, b: TableRef): boolean {
  return a.name === b.name && (a.schema ?? null) === (b.schema ?? null)
}

function byName(a: TableRef, b: TableRef): number {
  return (a.schema ?? '').localeCompare(b.schema ?? '') || a.name.localeCompare(b.name)
}

// The diagram's tables, its own first. 'related' adds the tables its foreign keys refer to and those
// whose foreign keys refer to it, by name; 'all' adds the other tables (not views) of its schema, in
// the order listed.
export function tablesToShow(
  table: TableRef,
  scope: DiagramScope,
  tables: TableInfo[],
  keys: ForeignKeyInfo[]
): TableRef[] {
  const own = { schema: table.schema, name: table.name }
  if (scope === 'all') {
    const others = tables.filter(
      (t) => t.type === 'table' && (t.schema ?? null) === (own.schema ?? null) && !same(t, own)
    )
    return [own, ...others.map((t) => ({ schema: t.schema, name: t.name }))]
  }
  const related = new Map<string, TableRef>()
  for (const key of keys) {
    if (same(key.table, own)) related.set(tableKey(key.references), key.references)
    if (same(key.references, own)) related.set(tableKey(key.table), key.table)
  }
  related.delete(tableKey(own))
  return [own, ...[...related.values()].sort(byName)]
}

// A foreign key drawn in the diagram, from the table that has it (`source`) to the table it refers
// to (`target`), both table keys.
export interface Link {
  id: string
  key: ForeignKeyInfo
  source: string
  target: string
}

// The foreign keys between the shown tables.
export function linksAmong(shown: TableRef[], keys: ForeignKeyInfo[]): Link[] {
  const ids = new Set(shown.map(tableKey))
  return keys.flatMap((key, i) => {
    const source = tableKey(key.table)
    const target = tableKey(key.references)
    if (!ids.has(source) || !ids.has(target)) return []
    return [{ id: `fk${i}`, key, source, target }]
  })
}

// A table's box: its name in a header, then a row per column with its type. Text isn't measured
// (the layout runs before anything renders), so the width is estimated from the longest line,
// within limits; a longer name or type is cut short with an ellipsis.
const HEADER_HEIGHT = 32
const ROW_HEIGHT = 22
const BODY_PADDING = 4
const BORDER = 1
const MIN_WIDTH = 180
const MAX_WIDTH = 360
// Average widths of a character of 12px system text and 11px monospace, a little generous.
const SANS_CHAR = 7
const MONO_CHAR = 6.7

export function nodeSize(table: TableRef, columns: ColumnInfo[]): Size {
  const title = (table.schema ? table.schema.length + 1 : 0) + table.name.length
  // The header's icon and padding; a row's key icon, padding and the gap before its type.
  let width = title * SANS_CHAR + 48
  for (const c of columns) {
    width = Math.max(width, c.name.length * SANS_CHAR + c.dataType.length * MONO_CHAR + 64)
  }
  return {
    width: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width))),
    height: HEADER_HEIGHT + Math.max(1, columns.length) * ROW_HEIGHT + (BODY_PADDING + BORDER) * 2
  }
}

const NODE_GAP = 32
const RANK_GAP = 96
// Width to height: the shape a diagram aims for, wider than tall as a window is.
const ASPECT = 1.6

type Box = { id: string } & Size

// Places the tables: those linked by foreign keys as dagre lays them out (see `layoutLinked`);
// then the unlinked ones (and those linked only to themselves) in a grid beneath. Positions are
// top-left corners.
export function layout(
  nodes: Box[],
  links: { source: string; target: string }[]
): Map<string, Point> {
  const linked = new Set(
    links.filter((l) => l.source !== l.target).flatMap((l) => [l.source, l.target])
  )
  const positions = linked.size > 0 ? layoutLinked(nodes, links, linked) : new Map<string, Point>()
  let bottom = 0
  for (const n of nodes) {
    const at = positions.get(n.id)
    if (at) bottom = Math.max(bottom, at.y + n.height)
  }

  const unlinked = nodes.filter((n) => !linked.has(n.id))
  if (unlinked.length === 0) return positions
  const perRow = Math.ceil(Math.sqrt(unlinked.length * ASPECT))
  const columnWidth = Math.max(...unlinked.map((n) => n.width)) + NODE_GAP
  let y = linked.size > 0 ? Math.round(bottom) + RANK_GAP : 0
  for (let i = 0; i < unlinked.length; i += perRow) {
    const row = unlinked.slice(i, i + perRow)
    row.forEach((n, j) => positions.set(n.id, { x: j * columnWidth, y }))
    y += Math.max(...row.map((n) => n.height)) + NODE_GAP
  }
  return positions
}

// A table with its centre as dagre placed it.
type Ranked = { box: Box; x: number; y: number }

// dagre lays the linked tables out in ranks, left to right, a table left of the tables referring
// to it. Many tables referring to one (accounts, users) make one rank, a column too tall to read
// once the diagram is zoomed out to fit the tab; so a rank taller than the diagram should be (for
// its tables' total area at ASPECT) is wrapped into balanced columns side by side, in dagre's
// order, and the ranks to its right move over. Other ranks stay as dagre put them.
function layoutLinked(
  nodes: Box[],
  links: { source: string; target: string }[],
  linked: Set<string>
): Map<string, Point> {
  const boxes = nodes.filter((n) => linked.has(n.id))
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: NODE_GAP, ranksep: RANK_GAP, marginx: 0, marginy: 0 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of boxes) g.setNode(n.id, { width: n.width, height: n.height })
  for (const l of links) if (l.source !== l.target) g.setEdge(l.target, l.source)
  dagre.layout(g)

  // A rank's tables share a centre line.
  const byRank = Map.groupBy(
    boxes.map((box): Ranked => ({ box, ...g.node(box.id) })),
    (r) => Math.round(r.x)
  )
  const ranks = [...byRank.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, rank]) => rank.sort((a, b) => a.y - b.y))
  const stacked = (rank: Ranked[]): number =>
    rank.reduce((sum, r) => sum + r.box.height, 0) + NODE_GAP * (rank.length - 1)
  const area = boxes.reduce((sum, n) => sum + (n.width + NODE_GAP) * (n.height + NODE_GAP), 0)
  const maxHeight = Math.max(Math.sqrt(area / ASPECT), ...boxes.map((n) => n.height))

  const positions = new Map<string, Point>()
  let shift = 0
  for (const rank of ranks) {
    const width = Math.max(...rank.map((r) => r.box.width))
    const height = stacked(rank)
    if (height <= maxHeight) {
      for (const { box, x, y } of rank) {
        positions.set(box.id, {
          x: Math.round(x - box.width / 2 + shift),
          y: Math.round(y - box.height / 2)
        })
      }
      continue
    }
    // As many columns as it takes, each started once the last is about its share of the height.
    const count = Math.ceil(height / maxHeight)
    const share = height / count
    const columns: Ranked[][] = []
    let used = Infinity
    for (const r of rank) {
      if (columns.length < count && used + NODE_GAP + r.box.height / 2 > share) {
        columns.push([r])
        used = r.box.height
      } else {
        columns[columns.length - 1].push(r)
        used += NODE_GAP + r.box.height
      }
    }
    const first = rank[0]
    const last = rank[rank.length - 1]
    const middle = (first.y - first.box.height / 2 + last.y + last.box.height / 2) / 2
    const left = first.x - width / 2 + shift
    let x = left
    for (const column of columns) {
      const columnWidth = Math.max(...column.map((r) => r.box.width))
      let y = middle - stacked(column) / 2
      for (const { box } of column) {
        positions.set(box.id, {
          x: Math.round(x + (columnWidth - box.width) / 2),
          y: Math.round(y)
        })
        y += box.height + NODE_GAP
      }
      x += columnWidth + NODE_GAP
    }
    shift += x - NODE_GAP - left - width
  }
  return positions
}

export interface Viewport extends Point {
  zoom: number
}

// Below this zoom, a table's text is too small to read.
const READABLE_ZOOM = 0.6
// The zoom a diagram too big to fit readably opens at.
const START_ZOOM = 0.8
// Space around a fitted diagram, in screen pixels.
const FIT_MARGIN = 24

// Where a diagram opens (React Flow's viewport: the pan in screen pixels, and the zoom) in a pane
// of `pane`'s size: all of it, centred, if it fits at a readable zoom (never over 100%); or else at
// START_ZOOM, centred on its own table (top-aligned if that is taller than the pane). The fit
// button and the overview reach the rest.
export function initialViewport(
  boxes: (Point & Size & { id: string })[],
  ownId: string,
  pane: Size
): Viewport {
  const left = Math.min(...boxes.map((b) => b.x))
  const top = Math.min(...boxes.map((b) => b.y))
  const width = Math.max(...boxes.map((b) => b.x + b.width)) - left
  const height = Math.max(...boxes.map((b) => b.y + b.height)) - top
  const fit = Math.min(
    1,
    (pane.width - FIT_MARGIN * 2) / width,
    (pane.height - FIT_MARGIN * 2) / height
  )
  if (fit >= READABLE_ZOOM) {
    return {
      x: Math.round((pane.width - width * fit) / 2 - left * fit),
      y: Math.round((pane.height - height * fit) / 2 - top * fit),
      zoom: fit
    }
  }
  const own = boxes.find((b) => b.id === ownId) ?? boxes[0]
  const zoom = START_ZOOM
  const tall = own.height * zoom > pane.height - FIT_MARGIN * 2
  return {
    x: Math.round(pane.width / 2 - (own.x + own.width / 2) * zoom),
    y: Math.round(
      tall ? FIT_MARGIN - own.y * zoom : pane.height / 2 - (own.y + own.height / 2) * zoom
    ),
    zoom
  }
}

export type Side = 'left' | 'right'

// Which sides of the two tables a link leaves and enters: facing each other when one is wholly to
// the side of the other, or else (one above the other, or a table referring to itself) both on the
// right, so the line loops out and back.
export function linkSides(
  source: Point & { width: number },
  target: Point & { width: number },
  self: boolean
): { source: Side; target: Side } {
  if (!self && source.x + source.width < target.x) return { source: 'right', target: 'left' }
  if (!self && target.x + target.width < source.x) return { source: 'left', target: 'right' }
  return { source: 'right', target: 'right' }
}

// The handle a line attaches to (TableNode gives each anchor four): on a column, or the header
// (null), on one side, as the line's start (source) or end (target).
export function handleId(column: string | null, side: Side, end: 'source' | 'target'): string {
  return `${end}:${side}:${column === null ? '' : `c:${column}`}`
}

// What a table's column refers to, if it is in a foreign key: e.g. `accounts.id`, or for a key of
// several columns, each of them. Shown on the column's row.
export function referencesOf(table: TableRef, keys: ForeignKeyInfo[]): Map<string, string[]> {
  const refs = new Map<string, string[]>()
  for (const key of keys) {
    if (!same(key.table, table)) continue
    const name = key.references.schema
      ? `${key.references.schema}.${key.references.name}`
      : key.references.name
    key.columns.forEach((column, i) => {
      const target = `${name}.${key.referencedColumns[i] ?? '?'}`
      refs.set(column, [...(refs.get(column) ?? []), target])
    })
  }
  return refs
}
