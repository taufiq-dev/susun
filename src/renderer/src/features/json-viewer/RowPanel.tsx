import { useMemo, useState } from 'react'
import { json } from '@codemirror/lang-json'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { SidePanel } from '@renderer/components/SidePanel'
import { TextInput } from '@renderer/components/ui'
import { editorLook } from '@renderer/features/query/editor'
import { focusedTab, shownRow, useTabs } from '@renderer/store/tabs'
import { rowJson } from './row'

const BASIC_SETUP = {
  lineNumbers: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  autocompletion: false,
  closeBrackets: false,
  history: false,
  indentOnInput: false
}

const EXTENSIONS = [
  json(),
  // The panel is narrow, and a long text value is one line.
  EditorView.lineWrapping,
  EditorView.theme({ '&': { fontSize: '12px' } }),
  editorLook
]

// The selected row of the focused pane's active tab, as JSON. Its objects and arrays fold. The
// filter stays while the row changes, to follow one key from row to row.
export function RowPanel(): React.JSX.Element {
  const row = useTabs((s) => shownRow(focusedTab(s)))
  const [filter, setFilter] = useState('')
  const text = useMemo(() => (row ? rowJson(row.columns, row.values, filter) : null), [row, filter])

  return (
    <SidePanel id="row" side="right" label="Row" resizeLabel="Resize the row panel">
      <h2 className="px-3 pt-2.5 pb-1 text-[12px] font-semibold">Row</h2>
      {!row && (
        <p className="px-3 text-[12px] text-muted">
          Select a row in a table or query result to see it here as JSON.
        </p>
      )}
      {row && (
        <div className="p-2 pt-1">
          <TextInput
            type="search"
            aria-label="Filter keys"
            placeholder="Filter keys"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}
      {row && text === null && (
        <p className="px-3 text-[12px] text-muted">No keys match “{filter.trim()}”.</p>
      )}
      {text !== null && (
        <div className="min-h-0 flex-1 border-t border-line">
          <CodeMirror
            value={text}
            readOnly
            extensions={EXTENSIONS}
            basicSetup={BASIC_SETUP}
            indentWithTab={false}
            theme="none"
            height="100%"
            className="h-full"
            aria-label="The selected row as JSON"
          />
        </div>
      )}
    </SidePanel>
  )
}
