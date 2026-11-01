import { updateRowSql } from '@shared/sql'
import { useSession } from '@renderer/store/session'
import { useTabs, type TableTabState } from '@renderer/store/tabs'

// A table tab's unsaved changes (`TableTabState.edits`): what counts as one, and saving them.

export function hasEdits(tab: TableTabState): boolean {
  return Object.keys(tab.edits ?? {}).length > 0
}

// A row's identity: its primary key values, as JSON.
export function rowKey(keyValues: unknown[]): string {
  return JSON.stringify(keyValues, (_key, value: unknown) =>
    value instanceof Uint8Array ? Array.from(value) : value
  )
}

// A value as the cell editor shows it and as an edit is compared with it: NULL stays null, JSON
// becomes its text, the rest their text.
export function editable(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'object' && !(value instanceof Uint8Array)) return JSON.stringify(value)
  return String(value)
}

// Saves the tab's changes in one transaction (`DbApi.applyChanges`), then drops them. Resolves to
// whether they were saved; if not, the user has been told why in a dialog and the changes stay.
export async function saveEdits(tabId: string): Promise<boolean> {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
  const session = useSession.getState().session
  if (tab?.type !== 'table' || !session) return false
  const rows = Object.values(tab.edits ?? {})
  if (rows.length === 0) return true
  const statements = rows.map((row) =>
    updateRowSql(
      session.type,
      tab.table,
      Object.entries(row.changes).map(([column, value]) => ({ column, value })),
      row.key
    )
  )
  try {
    await window.api.db.applyChanges(session.connectionId, statements)
  } catch (err) {
    await window.api.dialog
      .showError(
        `Couldn’t save the changes to “${tab.title}”`,
        `${(err as Error).message}\n\nNothing was saved; the changes are still there to fix or discard.`
      )
      .catch((shown: Error) => console.error('showing the error failed:', shown.message))
    return false
  }
  useTabs.getState().updateTable(tabId, { edits: undefined })
  return true
}
