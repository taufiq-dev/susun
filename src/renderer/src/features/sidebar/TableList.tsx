import { useEffect, useRef, useState } from 'react'
import { SELECT_TOP_ROWS } from '@shared/sql'
import type { DbType, TableInfo, TableRef } from '@shared/types'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CollapseAllIcon,
  ExpandAllIcon,
  RefreshIcon,
  SchemaIcon,
  SchemaOpenIcon,
  TableIcon,
  ViewIcon
} from '@renderer/components/icons'
import { moveFocus } from '@renderer/components/roving'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@renderer/components/shadcn/context-menu'
import { Button, IconButton, TextInput } from '@renderer/components/ui'
import { useSession } from '@renderer/store/session'
import { focusedTab, sameTable, useTabs } from '@renderer/store/tabs'
import { copyName, drop, selectTop, truncate, viewData, viewStructure } from './tableActions'

type Loaded = { tables: TableInfo[] } | { error: string }

// The tree's rows: schemas and tables. The tree is one Tab stop (the selected table, or else the
// first row), and the arrow keys move through it.
const ITEM = 'button[data-item]'

// The sidebar's Tables view: a filter, a header with the count and its buttons, and the tables as
// a tree with a folder for each Postgres schema, which opens and closes as an accordion. MySQL and
// SQLite tables have no schema, so they're a flat list. While filtering, every match shows, closed
// schemas or not. Clicking a table selects it (as do the arrow keys); double-clicking it, or Enter,
// opens it in a tab, so a click to look at the list doesn't open a tab.
export function TableList({ connectionId }: { connectionId: string }): React.JSX.Element {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reloads, setReloads] = useState(0)
  // A reload keeps the list it has (and its scroll position) until the new one arrives.
  const [reloading, setReloading] = useState(false)
  const [filter, setFilter] = useState('')
  // Schemas the user has closed; the rest are open.
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const filterInput = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const openTable = useTabs((s) => s.openTable)
  const type = useSession((s) => s.session?.type ?? 'postgres')
  const reconnects = useSession((s) => s.reconnects)
  // The focused pane's table, if it shows one.
  const activeTable = useTabs((s) => {
    const tab = focusedTab(s)
    return tab?.type === 'table' ? tab.table : null
  })
  // The table last clicked or arrowed to, with the active table at the time. The selection is the
  // focused pane's table, until a click picks another; once the active table changes (a table is
  // opened, or another tab or pane is focused), it follows that again.
  const [picked, setPicked] = useState<{ table: TableRef; active: TableRef | null } | null>(null)
  const pickedNow =
    picked &&
    (picked.active === null || activeTable === null
      ? picked.active === activeTable
      : sameTable(picked.active, activeTable))
  const selected = pickedNow ? picked.table : activeTable

  useEffect(() => {
    let current = true
    window.api.db.listTables(connectionId).then(
      (tables) => {
        if (!current) return
        setLoaded({ tables })
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
  }, [connectionId, reloads, reconnects])

  const reload = (): void => {
    setReloading(true)
    setReloads((n) => n + 1)
  }

  const tables = loaded && 'tables' in loaded ? loaded.tables : []
  const needle = filter.trim().toLowerCase()
  const shown = needle ? tables.filter((t) => t.name.toLowerCase().includes(needle)) : tables
  // Schemas in the database's order, each with its shown tables.
  const groups = [...Map.groupBy(shown, (t) => t.schema ?? '')]
  const schemas = [...new Set(tables.map((t) => t.schema ?? ''))].filter(Boolean)
  const isOpen = (schema: string): boolean => !!needle || !closed.has(schema)
  const allClosed = schemas.length > 0 && schemas.every((s) => closed.has(s))

  const toggle = (schema: string, open = !isOpen(schema)): void => {
    setClosed((prev) => {
      const next = new Set(prev)
      if (open) next.delete(schema)
      else next.add(schema)
      return next
    })
  }

  // The rows in order, as they show: what the Tab stop and keyboard work on.
  const visible = groups.flatMap(([schema, inSchema]) =>
    schema && !isOpen(schema) ? [] : inSchema
  )
  const isSelected = (t: TableInfo): boolean => selected !== null && sameTable(t, selected)
  const current = visible.find(isSelected) ?? visible[0]
  // With no table to stop on (every schema closed), the first schema is the Tab stop.
  const schemaStop = current ? undefined : groups[0]?.[0]

  // Right opens a closed schema or steps into an open one; Left closes an open schema or steps
  // from a table up to its schema. Up from the first row goes back to the filter.
  const onTreeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const row = e.target as HTMLElement
    if (!row.matches(ITEM)) return
    const schema = row.dataset.schema
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const right = e.key === 'ArrowRight'
      if (row.dataset.item === 'schema' && schema !== undefined) {
        if (right && isOpen(schema)) {
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>(ITEM)]
          items[items.indexOf(row) + 1]?.focus()
        } else if (right || isOpen(schema)) toggle(schema, right)
      } else if (!right && schema) {
        e.currentTarget
          .querySelector<HTMLElement>(
            `${ITEM}[data-item=schema][data-schema="${CSS.escape(schema)}"]`
          )
          ?.focus()
      }
      return
    }
    if (e.key === 'ArrowUp' && row === e.currentTarget.querySelector(ITEM)) {
      e.preventDefault()
      filterInput.current?.focus()
      return
    }
    moveFocus(e, e.currentTarget, ITEM, 'vertical')
  }

  return (
    <section aria-label="Tables" className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pt-2 pb-1">
        <TextInput
          type="search"
          aria-label="Filter tables"
          placeholder="Filter tables"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          ref={filterInput}
          // Down goes into the tree. Enter opens the table if only one shows, or else goes into
          // the tree, where Enter opens the focused table (or opens or closes a schema).
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'Enter') return
            const stop = list.current?.querySelector<HTMLElement>(`${ITEM}[tabindex="0"]`)
            if (!stop) return
            e.preventDefault()
            if (e.key === 'Enter' && visible.length === 1) openTable(visible[0])
            else stop.focus()
          }}
        />
      </div>
      <div className="flex h-8 shrink-0 items-center gap-1.5 pr-1 pl-3">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted uppercase">Tables</h2>
        {loaded && 'tables' in loaded && (
          <span
            aria-label={
              needle ? `${shown.length} of ${tables.length} shown` : `${tables.length} in all`
            }
            className="rounded-full bg-ink/10 px-1.5 text-[11px] text-muted tabular-nums"
          >
            {needle ? `${shown.length}/${tables.length}` : tables.length}
          </span>
        )}
        <div className="ml-auto flex">
          {schemas.length > 0 && (
            <IconButton
              label={allClosed ? 'Open all schemas' : 'Close all schemas'}
              disabled={!!needle}
              onClick={() => setClosed(allClosed ? new Set() : new Set(schemas))}
            >
              {allClosed ? <ExpandAllIcon /> : <CollapseAllIcon />}
            </IconButton>
          )}
          <IconButton label="Reload tables" onClick={reload} disabled={reloading}>
            <RefreshIcon />
          </IconButton>
        </div>
      </div>
      <div
        ref={list}
        role="tree"
        aria-label="Tables"
        onKeyDown={onTreeKeyDown}
        className="min-h-0 flex-1 overflow-y-auto pb-2"
      >
        {loaded === null && <p className="px-3 text-[12px] text-muted">Loading tables…</p>}
        {loaded && 'error' in loaded && (
          <div className="flex flex-col items-start gap-2 px-3">
            <p className="text-[12px] text-danger select-text">{loaded.error}</p>
            <Button onClick={reload} disabled={reloading}>
              Try again
            </Button>
          </div>
        )}
        {loaded && 'tables' in loaded && tables.length === 0 && (
          <p className="px-3 text-[12px] text-muted">This database has no tables or views.</p>
        )}
        {tables.length > 0 && shown.length === 0 && (
          <p className="px-3 text-[12px] text-muted">No tables match “{filter.trim()}”.</p>
        )}
        {groups.map(([schema, inSchema]) => {
          const rows = inSchema.map((t) => (
            <TableRow
              key={t.name}
              table={t}
              nested={!!schema}
              selected={isSelected(t)}
              tabStop={t === current}
              onSelect={() => setPicked({ table: t, active: activeTable })}
              onOpen={() => openTable(t)}
              menu={
                <TableMenu connectionId={connectionId} type={type} table={t} onDropped={reload} />
              }
            />
          ))
          if (!schema) return rows
          const open = isOpen(schema)
          return (
            <div key={schema} role="none">
              <button
                type="button"
                data-item="schema"
                data-schema={schema}
                role="treeitem"
                aria-level={1}
                aria-expanded={open}
                tabIndex={schema === schemaStop ? 0 : -1}
                onClick={() => toggle(schema)}
                className="focus-ring flex h-6 w-full items-center gap-1.5 pr-3 pl-2 text-left hover:bg-surface/70"
              >
                <span className="text-muted">
                  {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </span>
                <span className="text-muted">{open ? <SchemaOpenIcon /> : <SchemaIcon />}</span>
                <span className="truncate">{schema}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted tabular-nums">
                  {inSchema.length}
                </span>
              </button>
              {open && <div role="group">{rows}</div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// A table or view in the tree. A click or the focus selects it, and a double-click or Enter opens
// it. Right-clicking it opens its menu (shadcn's ContextMenu).
function TableRow({
  table,
  nested,
  selected,
  tabStop,
  onSelect,
  onOpen,
  menu
}: {
  table: TableInfo
  // Inside a schema's folder, so indented under it.
  nested: boolean
  selected: boolean
  tabStop: boolean
  onSelect: () => void
  onOpen: () => void
  menu: React.JSX.Element
}): React.JSX.Element {
  const view = table.type === 'view'
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={<button type="button" />}
        data-item="table"
        data-schema={table.schema}
        role="treeitem"
        aria-level={nested ? 2 : 1}
        aria-selected={selected}
        tabIndex={tabStop ? 0 : -1}
        title={`${table.schema ? `${table.schema}.${table.name}` : table.name}${view ? ' (view)' : ''}`}
        onFocus={onSelect}
        onClick={onSelect}
        onDoubleClick={onOpen}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          onOpen()
        }}
        className={`focus-ring flex h-6 w-full items-center gap-1.5 pr-3 text-left ${
          nested ? 'pl-[42px]' : 'pl-3'
        } ${selected ? 'bg-accent/15 text-ink' : 'hover:bg-surface/70 data-popup-open:bg-surface/70'}`}
      >
        <span className="text-muted">{view ? <ViewIcon /> : <TableIcon />}</span>
        <span className="truncate">{table.name}</span>
        {view && <span className="ml-auto shrink-0 text-[11px] text-muted">view</span>}
      </ContextMenuTrigger>
      {menu}
    </ContextMenu>
  )
}

// A table's right-click menu.
function TableMenu({
  connectionId,
  type,
  table,
  onDropped
}: {
  connectionId: string
  type: DbType
  table: TableInfo
  onDropped: () => void
}): React.JSX.Element {
  const view = table.type === 'view'
  return (
    <ContextMenuContent aria-label={`${table.name} ${view ? 'view' : 'table'}`}>
      <ContextMenuItem onClick={() => viewData(table)}>View data</ContextMenuItem>
      <ContextMenuItem onClick={() => viewStructure(table)}>View structure</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => copyName(table)}>Copy name</ContextMenuItem>
      <ContextMenuItem onClick={() => selectTop(type, table)}>
        SQL: Select top {SELECT_TOP_ROWS}
      </ContextMenuItem>
      <ContextMenuSeparator />
      {!view && (
        <ContextMenuItem
          variant="destructive"
          onClick={() => void truncate(connectionId, type, table)}
        >
          Truncate…
        </ContextMenuItem>
      )}
      <ContextMenuItem
        variant="destructive"
        onClick={() => void drop(connectionId, type, table, onDropped)}
      >
        {view ? 'Drop view…' : 'Drop table…'}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
