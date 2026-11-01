import { useEffect, useRef, useState } from 'react'
import type { QueryFileEntry } from '@shared/types'
import { CloseIcon, FolderOpenIcon } from '@renderer/components/icons'
import { moveFocus } from '@renderer/components/roving'
import { IconButton, TextInput } from '@renderer/components/ui'
import { openListedFile, openQueryFile } from '@renderer/features/query/files'
import { useLibrary } from '@renderer/store/library'
import { fileName, focusedTab, useTabs } from '@renderer/store/tabs'
import { folderOf } from './format'

type Loaded = { files: QueryFileEntry[] } | { error: string }

const ITEM = 'button[data-file]'

// The sidebar's Saved queries view: the .sql files saved or opened while connected to this
// connection, most recently used first. Clicking one opens it (or goes to its tab). A file that
// has moved or been deleted shows as missing; × takes a file off the list, leaving the file.
export function SavedQueries({ connectionId }: { connectionId: string }): React.JSX.Element {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [filter, setFilter] = useState('')
  const version = useLibrary((s) => s.files)
  const list = useRef<HTMLDivElement>(null)
  // The focused pane's file, highlighted.
  const openPath = useTabs((s) => {
    const tab = focusedTab(s)
    return tab?.type === 'query' ? tab.file?.path : undefined
  })

  useEffect(() => {
    let current = true
    window.api.files.list(connectionId).then(
      (files) => current && setLoaded({ files }),
      (err: Error) => current && setLoaded({ error: err.message })
    )
    return () => {
      current = false
    }
  }, [connectionId, version])

  const forget = (path: string): void => {
    window.api.files.forget(connectionId, path).then(
      () => useLibrary.getState().filesChanged(),
      (err: Error) => console.error('removing from the list failed:', err.message)
    )
  }

  const needle = filter.trim().toLowerCase()
  const files = loaded && 'files' in loaded ? loaded.files : []
  const shown = files.filter((f) => fileName(f.path).toLowerCase().includes(needle))
  const current = shown.find((f) => f.path === openPath) ?? shown[0]

  return (
    <section aria-label="Saved queries" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 p-2">
        <TextInput
          type="search"
          aria-label="Filter saved queries"
          placeholder="Filter saved queries"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'Enter') return
            const items = list.current?.querySelectorAll<HTMLElement>(ITEM) ?? []
            if (items.length === 0) return
            e.preventDefault()
            if (e.key === 'Enter' && items.length === 1) items[0].click()
            else list.current?.querySelector<HTMLElement>(`${ITEM}[tabindex="0"]`)?.focus()
          }}
        />
        <IconButton label="Open a query file…" onClick={() => void openQueryFile()}>
          <FolderOpenIcon />
        </IconButton>
      </div>
      <div
        ref={list}
        onKeyDown={(e) => {
          if (e.target instanceof HTMLElement && e.target.matches(ITEM)) {
            moveFocus(e, e.currentTarget, ITEM, 'vertical')
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto pb-2"
      >
        {loaded === null && <p className="px-3 text-[12px] text-muted">Loading…</p>}
        {loaded && 'error' in loaded && (
          <p className="px-3 text-[12px] text-danger select-text">{loaded.error}</p>
        )}
        {loaded && 'files' in loaded && files.length === 0 && (
          <p className="px-3 text-[12px] text-muted">
            Query files you save or open while connected here show up in this list.
          </p>
        )}
        {files.length > 0 && shown.length === 0 && (
          <p className="px-3 text-[12px] text-muted">No saved queries match “{filter.trim()}”.</p>
        )}
        <ul>
          {shown.map((file) => {
            const name = fileName(file.path)
            return (
              <li key={file.path} className="group relative">
                <button
                  type="button"
                  data-file
                  tabIndex={file === current ? 0 : -1}
                  title={file.missing ? `${file.path} (missing)` : file.path}
                  onClick={() => void openListedFile(file.path)}
                  className={`focus-ring flex w-full flex-col py-1 pr-8 pl-3 text-left ${
                    file.path === openPath ? 'bg-accent/15' : 'hover:bg-surface/70'
                  }`}
                >
                  <span className={`truncate ${file.missing ? 'text-muted line-through' : ''}`}>
                    {name}
                  </span>
                  <span className="truncate text-[11px] text-muted">
                    {file.missing ? 'Missing · ' : ''}
                    {folderOf(file.path)}
                  </span>
                </button>
                <IconButton
                  label={`Remove ${name} from this list`}
                  size="sm"
                  tabIndex={-1}
                  onClick={() => forget(file.path)}
                  className="absolute top-1.5 right-2 opacity-0 group-hover:opacity-100"
                >
                  <CloseIcon />
                </IconButton>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
