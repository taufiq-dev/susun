import type { CloseReason } from '@shared/api'
import { isDirty, saveTab } from '@renderer/features/query/files'
import { endSession } from '@renderer/features/query/run'
import { useTabs, type QueryTabState } from '@renderer/store/tabs'

// Only one save prompt at a time: a second Cmd+W, or a close while one is asking, is ignored.
let asking = false

async function oneAtATime(ask: () => Promise<boolean>): Promise<boolean> {
  if (asking) return false
  asking = true
  try {
    return await ask()
  } finally {
    asking = false
  }
}

// Closes a tab and its session, first asking whether to save a query tab's unsaved SQL (unless the
// user turned that off in Settings). Resolves to whether it closed: not if the user cancelled, or
// chose Save and then cancelled the Save dialog.
export function closeTab(connectionId: string, tabId: string): Promise<boolean> {
  return oneAtATime(async () => {
    const tab = useTabs.getState().tabs.find((t) => t.id === tabId)
    if (!tab) return false
    if (tab.type === 'query' && isDirty(tab)) {
      const choice = await window.api.app.confirmSave([tab.title], 'close-tab')
      if (choice === 'cancel') return false
      if (choice === 'save' && !(await saveTab(tabId))) return false
    }
    endSession(connectionId, tabId)
    useTabs.getState().close(tabId)
    return true
  })
}

// Before every tab closes (disconnecting, or the window closing): asks once about all the query
// tabs with unsaved SQL, and saves them if the user chooses Save All, showing each one as its Save
// dialog opens. Resolves to whether the tabs may close.
export function settleUnsaved(reason: Exclude<CloseReason, 'close-tab'>): Promise<boolean> {
  return oneAtATime(async () => {
    const dirty = useTabs
      .getState()
      .tabs.filter((t): t is QueryTabState => t.type === 'query' && isDirty(t))
    if (dirty.length === 0) return true
    const choice = await window.api.app.confirmSave(
      dirty.map((t) => t.title),
      reason
    )
    if (choice !== 'save') return choice === 'discard'
    for (const tab of dirty) {
      useTabs.getState().activate(tab.id)
      if (!(await saveTab(tab.id))) return false
    }
    return true
  })
}
