import { useLibrary } from '@renderer/store/library'
import { useSession } from '@renderer/store/session'
import { fileName, useTabs, type QueryTabState } from '@renderer/store/tabs'

// The open connection's id: files saved or opened go on its list.
function connectionId(): string | null {
  return useSession.getState().session?.connectionId ?? null
}

// Whether the tab has SQL that isn't saved: changed since it was read from or saved to its file,
// or, for a tab not on a file, any SQL other than what it was opened with.
export function isDirty(tab: QueryTabState): boolean {
  if (tab.file) return tab.sql !== tab.file.savedSql
  return tab.sql.trim() !== '' && tab.sql !== tab.initialSql
}

// Saves the query tab's SQL to its file, or, for a tab not on one (or with `as`, Save As), to a
// file the user picks. Resolves to whether it saved: not if the user cancelled the Save dialog, or
// writing failed (the main process tells the user why).
export async function saveTab(tabId: string, as = false): Promise<boolean> {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
  if (tab?.type !== 'query') return false
  // What is written, which the tab may move on from while the Save dialog is open.
  const sql = tab.sql
  const name = tab.file ? fileName(tab.file.path) : `${tab.title}.sql`
  const path = as ? null : (tab.file?.path ?? null)
  try {
    const saved = await window.api.files.saveSql(sql, path, name, connectionId())
    if (!saved) return false
    useTabs.getState().setFile(tabId, { path: saved, savedSql: sql })
    useLibrary.getState().filesChanged()
    return true
  } catch (err) {
    console.error('save failed:', (err as Error).message)
    return false
  }
}

// Asks for a .sql file and opens it in a query tab (or activates the tab already on it).
export async function openQueryFile(): Promise<void> {
  const file = await window.api.files.openSql(connectionId())
  if (!file) return
  useTabs.getState().openFile(file)
  useLibrary.getState().filesChanged()
}

// Opens a file from the connection's list (Saved queries), or activates the tab already on it.
export async function openListedFile(path: string): Promise<void> {
  const id = connectionId()
  if (!id) return
  const open = useTabs.getState().tabs.some((t) => t.type === 'query' && t.file?.path === path)
  const file = open ? { path, sql: '' } : await window.api.files.readSql(id, path)
  if (!file) return
  useTabs.getState().openFile(file)
  useLibrary.getState().filesChanged()
}
