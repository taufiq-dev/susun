import type { CloseReason } from '@shared/api'
import { isDirty, saveTab } from '@renderer/features/query/files'
import { endSession } from '@renderer/features/query/run'
import { hasEdits, saveEdits } from '@renderer/features/table/edits'
import { useTabs, type Tab } from '@renderer/store/tabs'

// Whether closing the tab would lose something: a query tab's unsaved SQL, or a table tab's
// changed rows. A diagram has nothing to lose.
export function isUnsaved(tab: Tab): boolean {
  if (tab.type === 'diagram') return false
  return tab.type === 'query' ? isDirty(tab) : hasEdits(tab)
}

// Saves it: the SQL to its file, or the rows to the table. Resolves to whether it did.
function saveChanges(tab: Tab): Promise<boolean> {
  if (tab.type === 'diagram') return Promise.resolve(true)
  return tab.type === 'query' ? saveTab(tab.id) : saveEdits(tab.id)
}

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
    if (isUnsaved(tab)) {
      const choice = await window.api.app.confirmSave([tab.title], 'close-tab')
      if (choice === 'cancel') return false
      if (choice === 'save' && !(await saveChanges(tab))) return false
    }
    endSession(connectionId, tabId)
    useTabs.getState().close(tabId)
    return true
  })
}

// Asks once about all the tabs with unsaved changes, and saves them if the user chooses Save All,
// showing each one as its Save dialog opens. Resolves to whether the tabs may close.
async function settle(tabs: Tab[], reason: CloseReason): Promise<boolean> {
  const dirty = tabs.filter(isUnsaved)
  if (dirty.length === 0) return true
  const choice = await window.api.app.confirmSave(
    dirty.map((t) => t.title),
    reason
  )
  if (choice !== 'save') return choice === 'discard'
  for (const tab of dirty) {
    useTabs.getState().activate(tab.id)
    if (!(await saveChanges(tab))) return false
  }
  return true
}

// Closes several tabs and their sessions (a tab's Close others and Close to the right), first
// asking once about those with unsaved changes. Resolves to whether they closed: none do if the
// user cancelled, or chose Save and then cancelled a Save dialog.
export function closeTabs(connectionId: string, tabIds: string[]): Promise<boolean> {
  return oneAtATime(async () => {
    const tabs = useTabs.getState().tabs.filter((t) => tabIds.includes(t.id))
    if (!(await settle(tabs, 'close-tab'))) return false
    for (const tab of tabs) {
      endSession(connectionId, tab.id)
      useTabs.getState().close(tab.id)
    }
    return true
  })
}

// Before every tab closes (disconnecting, switching, or the window closing): asks once about all
// the tabs with unsaved changes. Resolves to whether the tabs may close.
export function settleUnsaved(reason: Exclude<CloseReason, 'close-tab'>): Promise<boolean> {
  return oneAtATime(() => settle(useTabs.getState().tabs, reason))
}
