import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { ColumnInfo, TableRef } from '@shared/types'
import { ForeignKeyIcon, PrimaryKeyIcon, TableIcon } from '@renderer/components/icons'
import { cn } from '@renderer/lib/utils'
import { handleId } from './model'

// A table's box in an ER diagram: its name, then its columns with their types, a key on the
// primary key's and a link on foreign keys'. Sizes match `nodeSize` in model.ts.
export type TableNodeData = {
  table: TableRef
  columns: ColumnInfo[]
  // The diagram's own table, whose header is tinted.
  own: boolean
  // What each foreign key column refers to, e.g. `accounts.id`.
  references: Map<string, string[]>
  // The columns lines attach to, which get handles. A line whose column isn't listed (it couldn't
  // be read) attaches to the header.
  anchors: Set<string>
}

export type TableNodeType = Node<TableNodeData, 'table'>

// Lines leave and enter on either side, so each anchor has four handles, which aren't seen.
function Anchors({ column }: { column: string | null }): React.JSX.Element {
  return (
    <>
      {(['left', 'right'] as const).flatMap((side) =>
        (['source', 'target'] as const).map((end) => (
          <Handle
            key={`${side}${end}`}
            type={end}
            position={side === 'left' ? Position.Left : Position.Right}
            id={handleId(column, side, end)}
            isConnectable={false}
            className="opacity-0"
          />
        ))
      )}
    </>
  )
}

function describe(column: ColumnInfo, references: string[] | undefined): string {
  const parts = [`${column.name} ${column.dataType}`]
  if (column.primaryKey) parts.push('primary key')
  if (!column.nullable && !column.primaryKey) parts.push('not null')
  for (const target of references ?? []) parts.push(`→ ${target}`)
  return parts.join(', ')
}

export const TableNode = memo(function TableNode({
  data,
  selected
}: NodeProps<TableNodeType>): React.JSX.Element {
  const { table, columns, own, references, anchors } = data
  return (
    <div
      title="Double-click to open its data"
      className={cn(
        'overflow-hidden rounded-[6px] border border-line bg-surface text-[12px] shadow-sm',
        selected && 'border-accent outline-1 outline-accent'
      )}
    >
      <div
        className={cn(
          'relative flex h-8 items-center gap-1.5 border-b border-line bg-sunken px-2.5 font-semibold',
          own && 'bg-accent/15'
        )}
      >
        <span className="text-muted">
          <TableIcon />
        </span>
        <span className="truncate">
          {table.schema && <span className="font-normal text-muted">{table.schema}.</span>}
          {table.name}
        </span>
        <Anchors column={null} />
      </div>
      <div className="py-1">
        {columns.length === 0 && (
          <p className="flex h-[22px] items-center px-2.5 text-muted italic">No columns</p>
        )}
        {columns.map((c) => {
          const refs = references.get(c.name)
          return (
            <div
              key={c.name}
              title={describe(c, refs)}
              className="relative flex h-[22px] items-center gap-1.5 px-2.5"
            >
              <span
                className={cn('flex w-3 shrink-0', c.primaryKey ? 'text-accent' : 'text-muted')}
              >
                {c.primaryKey ? <PrimaryKeyIcon /> : refs ? <ForeignKeyIcon /> : null}
              </span>
              <span className={cn('min-w-0 truncate', c.primaryKey && 'font-semibold')}>
                {c.name}
              </span>
              <span className="ml-auto min-w-0 shrink truncate pl-2 font-mono text-[11px] text-muted">
                {c.dataType}
              </span>
              {anchors.has(c.name) && <Anchors column={c.name} />}
            </div>
          )
        })}
      </div>
    </div>
  )
})
