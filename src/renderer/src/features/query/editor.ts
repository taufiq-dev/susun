import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { MySQL, PostgreSQL, SQLite, sql, type SQLDialect } from '@codemirror/lang-sql'
import { tags as t } from '@lezer/highlight'
import { EditorView, type EditorState, type Extension } from '@uiw/react-codemirror'
import type { DbType } from '@shared/types'

const DIALECTS: Record<DbType, SQLDialect> = {
  postgres: PostgreSQL,
  mysql: MySQL,
  sqlite: SQLite
}

export function sqlLanguage(type: DbType): Extension {
  return sql({ dialect: DIALECTS[type] })
}

// Colours are the app's CSS variables, so the editor follows the OS theme and the workspace's
// accent (keywords take the connection's database colour) without being reconfigured.
const theme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--surface)',
    color: 'var(--ink)',
    fontSize: '13px'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--ink)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ink)' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--ink) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)' },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)',
    outline: 'none'
  },
  '.cm-placeholder': { color: 'color-mix(in srgb, var(--muted) 70%, transparent)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    boxShadow: '0 4px 14px rgb(0 0 0 / 0.12)',
    overflow: 'hidden'
  },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', fontSize: '12px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)'
  },
  '.cm-completionDetail': { color: 'inherit', opacity: 0.7 },
  // The default icons are emoji (a key for a keyword), which look out of place here.
  '.cm-completionIcon': { display: 'none' }
})

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.typeName], color: 'var(--accent)' },
  { tag: t.string, color: 'var(--syntax-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--syntax-number)' },
  { tag: [t.lineComment, t.blockComment], color: 'var(--muted)', fontStyle: 'italic' },
  // Quoted identifiers ("name", `name`) are names, not strings.
  { tag: t.special(t.string), color: 'var(--ink)' }
])

export const editorLook: Extension = [theme, syntaxHighlighting(highlight)]

// The selection if there is one, otherwise the whole editor.
export function sqlToRun(state: EditorState): string {
  const { from, to } = state.selection.main
  return from === to ? state.doc.toString() : state.sliceDoc(from, to)
}
