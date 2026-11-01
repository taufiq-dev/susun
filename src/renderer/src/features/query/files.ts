import { fileName, useTabs, type QueryTabState } from '@renderer/store/tabs'

// Whether the tab has SQL that isn't saved: changed since it was read from or saved to its file,
// or, for a tab not on a file, any SQL at all.
export function isDirty(tab: QueryTabState): boolean {
  return tab.file ? tab.sql !== tab.file.savedSql : tab.sql.trim() !== ''
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
  try {
    const path = await window.api.files.saveSql(sql, as ? null : (tab.file?.path ?? null), name)
    if (!path) return false
    useTabs.getState().setFile(tabId, { path, savedSql: sql })
    return true
  } catch (err) {
    console.error('save failed:', (err as Error).message)
    return false
  }
}

// Asks for a .sql file and opens it in a query tab (or activates the tab already on it).
export async function openQueryFile(): Promise<void> {
  const file = await window.api.files.openSql()
  if (file) useTabs.getState().openFile(file)
}
