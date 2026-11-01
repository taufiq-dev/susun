import type { AppCommand } from '@shared/api'
import { openQueryFile, saveTab } from './features/query/files'
import { closeTab, settleUnsaved } from './features/workspace/closing'
import { focusPaneContent } from './features/workspace/shortcuts'
import { useSession } from './store/session'
import { focusedTab, useTabs } from './store/tabs'

// Carries out the app menu's commands in a main window (see `AppCommand`). Listening starts before
// React renders, so the window can always close, even if the page failed to render.
async function run(command: AppCommand): Promise<void> {
  const session = useSession.getState().session
  const tabs = useTabs.getState()
  const tab = focusedTab(tabs)
  switch (command) {
    case 'close-window':
      if (await settleUnsaved('close-window')) await window.api.app.closeWindow()
      else await window.api.app.cancelClose()
      return
    case 'close-tab':
      // With no tab to close, the window closes, as in a browser.
      if (!session || !tab) return window.api.app.closeWindow()
      if (await closeTab(session.connectionId, tab.id)) {
        focusPaneContent(useTabs.getState().focusedPaneId)
      }
      return
  }
  // The rest need a connection.
  if (!session) return
  switch (command) {
    case 'new-query':
      tabs.openQuery()
      return
    case 'open':
      return openQueryFile()
    case 'save':
    case 'save-as':
      if (tab?.type === 'query') await saveTab(tab.id, command === 'save-as')
      return
  }
}

export function listenForCommands(): void {
  window.api.app.onCommand((command) => {
    run(command).catch((err) => console.error(`${command} failed:`, err))
  })
}
