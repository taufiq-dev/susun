import { hex } from '../../lib/hex'

// A row as the JSON the Row panel shows: pure functions, with unit tests in row.test.ts.

// How much of a binary value the panel shows, in bytes.
const BYTES_SHOWN = 1024

type Entry = [key: string, value: unknown]

// Each column's key: its name, or for a repeated name (`select a.id, b.id`) the name with the next
// free suffix: `id`, `id_2`.
function uniqueKeys(columns: string[]): string[] {
  const taken = new Set(columns)
  const seen = new Set<string>()
  return columns.map((name) => {
    if (!seen.has(name)) {
      seen.add(name)
      return name
    }
    let n = 2
    while (taken.has(`${name}_${n}`)) n++
    taken.add(`${name}_${n}`)
    return `${name}_${n}`
  })
}

// A value as JSON can hold it, without losing what it is: JSON has no NaN or Infinity (stringify
// would print them as null, which reads as NULL), and no bigint (stringify would throw).
function plain(value: unknown): unknown {
  if (value === undefined) return null
  if (value instanceof Uint8Array) {
    const text = hex(value, BYTES_SHOWN)
    return value.length > BYTES_SHOWN ? `${text} (${value.length.toLocaleString()} bytes)` : text
  }
  if (value instanceof Date) return value.toJSON()
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value)
  if (Array.isArray(value)) return value.map(plain)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]))
  }
  return value
}

const NO_MATCH = Symbol('no match')

function matches(key: string, needle: string): boolean {
  return key.toLowerCase().includes(needle)
}

// The entries whose keys match, whole, and of the others what matches inside them.
function filterEntries(entries: Entry[], needle: string): Entry[] {
  return entries.flatMap(([key, value]): Entry[] => {
    if (matches(key, needle)) return [[key, value]]
    const inner = filterValue(value, needle)
    return inner === NO_MATCH ? [] : [[key, inner]]
  })
}

// What matches inside a value, keeping the objects and arrays on the way to it.
function filterValue(value: unknown, needle: string): unknown {
  if (Array.isArray(value)) {
    const kept = value.map((v) => filterValue(v, needle)).filter((v) => v !== NO_MATCH)
    return kept.length > 0 ? kept : NO_MATCH
  }
  if (typeof value === 'object' && value !== null) {
    const kept = filterEntries(Object.entries(value), needle)
    return kept.length > 0 ? Object.fromEntries(kept) : NO_MATCH
  }
  return NO_MATCH
}

// The row as indented JSON, its keys in column order. It is written out key by key rather than from
// an object, which would move integer-like names (`select 1 as "2", 2 as "1"`) to the front.
//
// With `filter`, only the keys containing it, ignoring case, at any depth, with what is inside them
// and the objects around them; null if none do.
export function rowJson(columns: string[], values: unknown[], filter = ''): string | null {
  const keys = uniqueKeys(columns)
  const entries = keys.map((key, i): Entry => [key, plain(values[i])])
  const needle = filter.trim().toLowerCase()
  const shown = needle ? filterEntries(entries, needle) : entries
  if (needle && shown.length === 0) return null
  if (shown.length === 0) return '{}'
  const lines = shown.map(([key, value]) => {
    // Strings in the JSON have their newlines escaped, so these are all between values.
    const text = JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')
    return `  ${JSON.stringify(key)}: ${text}`
  })
  return `{\n${lines.join(',\n')}\n}`
}
