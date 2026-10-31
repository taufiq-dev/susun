import { useMemo, useRef } from 'react'
import { closeCompletion } from '@codemirror/autocomplete'
import CodeMirror, { Prec, keymap, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import type { DbType } from '@shared/types'
import { Button } from '@renderer/components/ui'
import { useLayout } from '@renderer/store/layout'
import { useTabs, type QueryTabState } from '@renderer/store/tabs'
import { editorLook, sqlLanguage, sqlToRun } from './editor'
import { Results, RunStatus } from './Results'
import { runQuery } from './run'

const RUN_SHORTCUT = navigator.userAgent.includes('Mac') ? '⌘↵' : 'Ctrl+Enter'

const BASIC_SETUP = { foldGutter: false }

export function QueryTab({
  tab,
  connectionId,
  dbType
}: {
  tab: QueryTabState
  connectionId: string
  dbType: DbType
}): React.JSX.Element {
  const setSql = useTabs((s) => s.setSql)
  const editorFraction = useLayout((s) => s.editorFraction)
  const setEditorFraction = useLayout((s) => s.setEditorFraction)
  const editor = useRef<ReactCodeMirrorRef>(null)
  const container = useRef<HTMLDivElement>(null)

  const extensions = useMemo(
    () => [
      sqlLanguage(dbType),
      editorLook,
      // Above the default keymap, where Mod-Enter inserts a blank line.
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: (view) => {
              closeCompletion(view)
              runQuery(connectionId, tab.id, sqlToRun(view.state))
              return true
            }
          }
        ])
      )
    ],
    [dbType, connectionId, tab.id]
  )

  const run = (): void => {
    const view = editor.current?.view
    if (!view) return
    runQuery(connectionId, tab.id, sqlToRun(view.state))
    view.focus()
  }

  const resizeTo = (clientY: number): void => {
    const rect = container.current?.getBoundingClientRect()
    if (rect) setEditorFraction((clientY - rect.top) / rect.height)
  }

  return (
    <div ref={container} className="flex h-full flex-col">
      <div
        className="min-h-0 shrink-0 overflow-hidden"
        style={{ height: `${editorFraction * 100}%` }}
      >
        <CodeMirror
          ref={editor}
          value={tab.sql}
          onChange={(sql) => setSql(tab.id, sql)}
          extensions={extensions}
          basicSetup={BASIC_SETUP}
          theme="none"
          height="100%"
          className="h-full"
          placeholder="select * from …"
          aria-label={`SQL for ${tab.title}`}
          autoFocus
        />
      </div>

      <div className="relative flex h-9 shrink-0 items-center gap-3 border-y border-line bg-sunken px-2">
        {/* Drag (or focus and use the arrow keys) to share the height between editor and results. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize editor"
          aria-valuenow={Math.round(editorFraction * 100)}
          aria-valuemin={15}
          aria-valuemax={85}
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) resizeTo(e.clientY)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') setEditorFraction(editorFraction - 0.05)
            else if (e.key === 'ArrowDown') setEditorFraction(editorFraction + 0.05)
          }}
          className="focus-ring absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
        />
        <Button
          variant="primary"
          onClick={run}
          disabled={tab.run?.state === 'running'}
          title={`Run the selection, or the whole editor (${RUN_SHORTCUT})`}
        >
          Run
          <span className="text-[11px] opacity-75">{RUN_SHORTCUT}</span>
        </Button>
        <span role="status" className="truncate text-[12px]">
          <RunStatus run={tab.run} />
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <Results run={tab.run} shortcut={RUN_SHORTCUT} />
      </div>
    </div>
  )
}
