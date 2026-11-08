import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesState,
  type Edge,
  type NodeTypes
} from '@xyflow/react'
import type { ColumnInfo, ForeignKeyInfo, TableRef } from '@shared/types'
import { RefreshIcon, ResetLayoutIcon } from '@renderer/components/icons'
import { Button, IconButton, Segmented } from '@renderer/components/ui'
import { useSession } from '@renderer/store/session'
import {
  useTabs,
  type DiagramScope,
  type DiagramTabChanges,
  type DiagramTabState
} from '@renderer/store/tabs'
import {
  handleId,
  initialViewport,
  layout,
  linkSides,
  linksAmong,
  nodeSize,
  referencesOf,
  tableKey,
  tablesToShow,
  type Link
} from './model'
import { TableNode, type TableNodeType } from './TableNode'

// What the diagram draws: the tables with their columns, and the foreign keys among them. `id`
// is new for each load, so the canvas starts afresh with it.
interface Model {
  id: number
  tables: { table: TableRef; columns: ColumnInfo[] }[]
  keys: ForeignKeyInfo[]
}

type Loaded = Model | { error: string }

let loads = 0

async function load(connectionId: string, table: TableRef, scope: DiagramScope): Promise<Model> {
  const [tables, keys] = await Promise.all([
    window.api.db.listTables(connectionId),
    window.api.db.listForeignKeys(connectionId)
  ])
  const name = table.schema ? `${table.schema}.${table.name}` : table.name
  const there = tables.some(
    (t) => t.name === table.name && (t.schema ?? null) === (table.schema ?? null)
  )
  if (!there) throw new Error(`There’s no table “${name}” in the database any more.`)
  const shown = tablesToShow(table, scope, tables, keys)
  const columns = await window.api.db.listColumnsOf(connectionId, shown)
  return { id: ++loads, tables: shown.map((t, i) => ({ table: t, columns: columns[i] })), keys }
}

// A link with the columns its line attaches to, or null for a table's header (when the column
// isn't among those read).
type Line = Link & { from: string | null; to: string | null }

// The tables as React Flow nodes, where the layout puts them, and the lines between them.
function build(model: Model, own: TableRef): { nodes: TableNodeType[]; lines: Line[] } {
  const refs = model.tables.map((t) => t.table)
  const links = linksAmong(refs, model.keys)
  const sized = model.tables.map((t) => ({
    ...t,
    id: tableKey(t.table),
    ...nodeSize(t.table, t.columns)
  }))
  const positions = layout(sized, links)
  const columnsOf = new Map(sized.map((t) => [t.id, new Set(t.columns.map((c) => c.name))]))
  const anchors = new Map(sized.map((t) => [t.id, new Set<string>()]))
  const attach = (table: string, column: string | undefined): string | null => {
    if (column === undefined || !columnsOf.get(table)?.has(column)) return null
    anchors.get(table)?.add(column)
    return column
  }
  const lines = links.map((l) => ({
    ...l,
    from: attach(l.source, l.key.columns[0]),
    to: attach(l.target, l.key.referencedColumns[0])
  }))
  const ownKey = tableKey(own)
  const nodes = sized.map((t): TableNodeType => ({
    id: t.id,
    type: 'table',
    position: positions.get(t.id) ?? { x: 0, y: 0 },
    // As estimated, which is exact for the height (its rows are of fixed height), and the width
    // the box is given.
    width: t.width,
    height: t.height,
    data: {
      table: t.table,
      columns: t.columns,
      own: t.id === ownKey,
      references: referencesOf(t.table, model.keys),
      anchors: anchors.get(t.id) ?? new Set()
    }
  }))
  return { nodes, lines }
}

// An ER diagram's tab: the tables around its table (or every table in its schema), with their
// columns, and a line for each foreign key between them, from a crow's foot at the table that has
// the key to a bar at the table it refers to. Tables can be dragged, and double-clicking one (or
// Enter) opens its data. Where tables were dragged and the pan and zoom are kept in the tab.
export function DiagramTab({
  tab,
  connectionId
}: {
  tab: DiagramTabState
  connectionId: string
}): React.JSX.Element {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reloads, setReloads] = useState(0)
  const [reloading, setReloading] = useState(false)
  // Goes up with Reset layout, which draws the canvas afresh.
  const [layouts, setLayouts] = useState(0)
  const reconnects = useSession((s) => s.reconnects)
  const updateDiagram = useTabs((s) => s.updateDiagram)
  const { schema, name } = tab.table
  const scope = tab.scope

  useEffect(() => {
    let current = true
    load(connectionId, { schema, name }, scope).then(
      (model) => {
        if (!current) return
        setLoaded(model)
        setReloading(false)
      },
      (err: Error) => {
        if (!current) return
        setLoaded({ error: err.message })
        setReloading(false)
      }
    )
    return () => {
      current = false
    }
  }, [connectionId, schema, name, scope, reloads, reconnects])

  const model = loaded && 'tables' in loaded ? loaded : null
  // Laid out once per load; the tables the user moved are put back where they left them.
  const built = useMemo(() => model && build(model, { schema, name }), [model, schema, name])

  const reload = (): void => {
    setReloading(true)
    setReloads((n) => n + 1)
  }

  const change = (changes: DiagramTabChanges): void => updateDiagram(tab.id, changes)

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* In a narrow pane the header drops the "ER diagram" label and the count, so the buttons
          keep their room (a container query on the header's own width). */}
      <div className="@container flex h-10 shrink-0 items-center gap-3 border-b border-line px-3">
        <h2 className="min-w-0 truncate font-semibold select-text">
          <span className="hidden font-normal text-muted @lg:inline">ER diagram: </span>
          {schema && <span className="font-normal text-muted">{schema}.</span>}
          {name}
        </h2>
        {model && (
          <span className="hidden shrink-0 text-[12px] text-muted @2xl:inline">
            {model.tables.length} {model.tables.length === 1 ? 'table' : 'tables'}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Segmented
            legend="Show"
            hideLegend
            name={`diagram-scope-${tab.id}`}
            value={scope}
            options={[
              { value: 'related', label: 'Related' },
              { value: 'all', label: schema ? 'Whole schema' : 'All tables' }
            ]}
            // Another set of tables is laid out afresh.
            onChange={(next) => change({ scope: next, positions: undefined, viewport: undefined })}
          />
          <IconButton
            label="Reset layout"
            tooltip="Lay the tables out again, and fit them in view"
            className="ml-2"
            onClick={() => {
              change({ positions: undefined, viewport: undefined })
              setLayouts((n) => n + 1)
            }}
          >
            <ResetLayoutIcon />
          </IconButton>
          <IconButton label="Reload" onClick={reload} disabled={reloading}>
            <RefreshIcon />
          </IconButton>
        </div>
      </div>
      <div className="er-diagram relative min-h-0 flex-1 bg-canvas">
        {loaded === null && (
          <p className="px-5 py-3 text-[12px] text-muted">Loading the diagram…</p>
        )}
        {loaded && 'error' in loaded && (
          <div className="flex flex-col items-start gap-2 px-5 py-3">
            <p className="text-[12px] text-danger select-text">{loaded.error}</p>
            <Button onClick={reload} disabled={reloading}>
              Try again
            </Button>
          </div>
        )}
        {built && (
          <Canvas
            key={`${model?.id}:${layouts}`}
            tab={tab}
            initialNodes={built.nodes.map((n) => {
              const moved = tab.positions?.[n.id]
              return moved ? { ...n, position: moved } : n
            })}
            lines={built.lines}
          />
        )}
      </div>
    </div>
  )
}

const NODE_TYPES: NodeTypes = { table: TableNode }

// The diagram itself. It keeps the tables' positions as they're dragged, and saves them to the tab
// when a drag ends (and the pan and zoom when they change), so they're back when the tab is. Until
// the user moves it, the view is `initialViewport`'s.
function Canvas({
  tab,
  initialNodes,
  lines
}: {
  tab: DiagramTabState
  initialNodes: TableNodeType[]
  lines: Line[]
}): React.JSX.Element {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  // The table under the pointer; its lines, and the selected tables', are drawn in the accent.
  const [hovered, setHovered] = useState<string | null>(null)
  const updateDiagram = useTabs((s) => s.updateDiagram)
  const openTable = useTabs((s) => s.openTable)
  const pane = useRef<HTMLDivElement>(null)

  const edges = useMemo((): Edge[] => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const lit = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    if (hovered) lit.add(hovered)
    return lines.flatMap((line) => {
      const source = byId.get(line.source)
      const target = byId.get(line.target)
      if (!source || !target) return []
      const sides = linkSides(
        { ...source.position, width: source.width ?? 0 },
        { ...target.position, width: target.width ?? 0 },
        line.source === line.target
      )
      const on = lit.has(line.source) || lit.has(line.target)
      const marker = on ? 'er-lit' : 'er'
      return [
        {
          id: line.id,
          source: line.source,
          target: line.target,
          sourceHandle: handleId(line.from, sides.source, 'source'),
          targetHandle: handleId(line.to, sides.target, 'target'),
          type: 'smoothstep',
          pathOptions: { borderRadius: 8, offset: 20 },
          markerStart: `${marker}-many`,
          markerEnd: `${marker}-one`,
          selectable: false,
          focusable: false,
          zIndex: on ? 1 : 0,
          style: on ? { stroke: 'var(--accent)', strokeWidth: 1.5 } : undefined,
          ariaLabel: `${line.key.table.name} (${line.key.columns.join(', ')}) refers to ${line.key.references.name} (${line.key.referencedColumns.join(', ')})`
        }
      ]
    })
  }, [nodes, lines, hovered])

  const open = (id: string | null | undefined): void => {
    const node = nodes.find((n) => n.id === id)
    if (node) openTable(node.data.table)
  }

  return (
    <div ref={pane} className="absolute inset-0">
      <Markers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        defaultViewport={tab.viewport}
        onInit={(flow) => {
          const size = pane.current?.getBoundingClientRect()
          if (tab.viewport || !size || nodes.length === 0) return
          const boxes = nodes.map((n) => ({
            id: n.id,
            ...n.position,
            width: n.width ?? 0,
            height: n.height ?? 0
          }))
          const own = nodes.find((n) => n.data.own)?.id ?? nodes[0].id
          void flow.setViewport(initialViewport(boxes, own, size))
        }}
        minZoom={0.1}
        maxZoom={2}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        attributionPosition="top-right"
        onNodeMouseEnter={(_, node) => setHovered(node.id)}
        onNodeMouseLeave={() => setHovered(null)}
        onNodeDoubleClick={(_, node) => open(node.id)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          const node = (e.target as HTMLElement).closest('.react-flow__node')
          if (node) open(node.getAttribute('data-id'))
        }}
        onNodeDragStop={(_, __, dragged) => {
          // From the store, since a drag may end after another one has saved.
          const current = useTabs.getState().tabs.find((t) => t.id === tab.id)
          const positions = { ...(current?.type === 'diagram' ? current.positions : undefined) }
          for (const n of dragged) positions[n.id] = n.position
          updateDiagram(tab.id, { positions })
        }}
        onMoveEnd={(_, viewport) => updateDiagram(tab.id, { viewport })}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls
          showInteractive={false}
          position="bottom-left"
          fitViewOptions={{ padding: 0.05, maxZoom: 1 }}
        />
        {/* An overview helps find the way around a large diagram; a small one is all in view. */}
        {nodes.length > 8 && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            ariaLabel="Overview"
            style={{ width: 160, height: 110 }}
          />
        )}
      </ReactFlow>
    </div>
  )
}

// The ends of a foreign key's line: a crow's foot (many) at the table that has the key, a bar
// (one) at the table it refers to; in the line colour, or in the accent for a lit line. React
// Flow refers to them by id. A start marker is turned round (auto-start-reverse), so in both,
// the line arrives from the left at (0, 0), where it meets the table.
function Markers(): React.JSX.Element {
  return (
    <svg aria-hidden className="absolute size-0">
      <defs>
        {[
          ['er', 'var(--xy-edge-stroke)'],
          ['er-lit', 'var(--accent)']
        ].map(([id, colour]) => (
          <g key={id}>
            <marker
              id={`${id}-many`}
              viewBox="-14 -8 16 16"
              refX={0}
              refY={0}
              markerWidth={16}
              markerHeight={16}
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path
                d="M -12 0 L 0 -6 M -12 0 L 0 0 M -12 0 L 0 6"
                fill="none"
                strokeWidth={1.25}
                style={{ stroke: colour }}
              />
            </marker>
            <marker
              id={`${id}-one`}
              viewBox="-14 -8 16 16"
              refX={0}
              refY={0}
              markerWidth={16}
              markerHeight={16}
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M -7 -6 L -7 6" fill="none" strokeWidth={1.25} style={{ stroke: colour }} />
            </marker>
          </g>
        ))}
      </defs>
    </svg>
  )
}
