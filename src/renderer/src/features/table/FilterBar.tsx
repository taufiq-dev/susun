import { useState } from 'react'
import { FILTER_OPERATORS, takesValue, type Filter, type FilterOperator } from '@shared/sql'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/shadcn/select'
import { Button, TextInput } from '@renderer/components/ui'

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  '=': '=',
  '<>': '≠',
  '<': '<',
  '>': '>',
  '<=': '≤',
  '>=': '≥',
  contains: 'contains',
  'starts with': 'starts with',
  'is null': 'is null',
  'is not null': 'is not null'
}

// The table tab's filter: a column, an operator and (for most operators) a value, applied with
// Enter or Apply; Clear shows while a filter is on. What's being edited stays here until applied.
export function FilterBar({
  columns,
  filter,
  onApply
}: {
  columns: string[]
  filter: Filter | undefined
  onApply: (filter: Filter | undefined) => void
}): React.JSX.Element {
  const [column, setColumn] = useState(filter?.column ?? '')
  const [operator, setOperator] = useState<FilterOperator>(filter?.operator ?? '=')
  const [value, setValue] = useState(filter?.value ?? '')
  // Until the user picks one, the first column.
  const chosen = columns.includes(column) ? column : (columns[0] ?? '')

  return (
    <form
      aria-label="Filter rows"
      onSubmit={(e) => {
        e.preventDefault()
        if (chosen) onApply({ column: chosen, operator, value })
      }}
      className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3"
    >
      <span className="text-[12px] text-muted">Filter</span>
      <Select
        items={Object.fromEntries(columns.map((c) => [c, c]))}
        value={chosen}
        onValueChange={(next) => next && setColumn(next)}
      >
        <SelectTrigger aria-label="Filter column" className="max-w-48 min-w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={OPERATOR_LABELS}
        value={operator}
        onValueChange={(next) => next && setOperator(next)}
      >
        <SelectTrigger aria-label="Filter operator" className="min-w-16">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FILTER_OPERATORS.map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {takesValue(operator) && (
        <TextInput
          aria-label="Filter value"
          placeholder="Value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-64"
        />
      )}
      <Button type="submit" disabled={!chosen}>
        Apply
      </Button>
      {filter && <Button onClick={() => onApply(undefined)}>Clear</Button>}
    </form>
  )
}
