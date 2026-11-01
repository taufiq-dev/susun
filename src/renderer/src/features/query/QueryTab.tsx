import { useMemo, useRef } from 'react'
import { closeCompletion } from '@codemirror/autocomplete'
import CodeMirror, { Prec, keymap, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import type { DbType } from '@shared/types'
import { Button } from '@renderer/components/ui'
import { useLayout } from '@renderer/store/layout'
import { useTabs, type QueryTabState } from '@renderer/store/tabs'
import { editorLook, sqlLanguage, statementsToRun } from './editor'
import { Results, RunStatus } from './Results'
import { cancelRun, runQuery } from './run'

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
  const setRunView = useTabs((s) => s.setRunView)
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
              void runQuery(connectionId, tab.id, statementsToRun(view.state, dbType))
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
    void runQuery(connectionId, tab.id, statementsToRun(view.state, dbType))
    view.focus()
  }

  // Offsets are from when the statement ran, so they're kept inside the text as it is now.
  const showStatement = (from: number, to: number): void => {
    const view = editor.current?.view
    if (!view) return
    const length = view.state.doc.length
    view.dispatch({
      selection: { anchor: Math.min(from, length), head: Math.min(to, length) },
      scrollIntoView: true
    })
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
        {tab.run?.state === 'running' ? (
          <Button
            onClick={() => cancelRun(tab.id)}
            disabled={tab.run.cancelling}
            title="Stop the running statement; the statements after it don’t run"
            className="min-w-20"
          >
            {tab.run.cancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={run}
            title={`Run the selection, or the whole editor (${RUN_SHORTCUT})`}
            className="min-w-20"
          >
            Run
            <span className="text-[11px] opacity-75">{RUN_SHORTCUT}</span>
          </Button>
        )}
        <span role="status" className="truncate text-[12px]">
          <RunStatus run={tab.run} />
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <Results
          run={tab.run}
          shortcut={RUN_SHORTCUT}
          onView={(view) => setRunView(tab.id, view)}
          onShowStatement={showStatement}
        />
      </div>
    </div>
  )
}
