import { useEffect } from 'react'
import { panesOf } from '@renderer/store/panes'
import { IS_MAC } from '@renderer/platform'
import { focusedTab, useTabs } from '@renderer/store/tabs'

// How menus and tooltips write the command key: "⌘\" on macOS, "Ctrl+\" elsewhere.
export const MOD = IS_MAC ? '⌘' : 'Ctrl+'

// Moves the keyboard focus into the pane, once it has rendered: to its editor, or else its active
// tab.
export function focusPaneContent(paneId: string): void {
  requestAnimationFrame(() => {
    const pane = document.querySelector(`[data-pane="${CSS.escape(paneId)}"]`)
    const target =
      pane?.querySelector<HTMLElement>('.cm-content') ??
      pane?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')
    target?.focus()
  })
}

// The workspace's keys, as in VS Code: Cmd+\ splits the focused pane's tab to the right, and
// Cmd+1 to Cmd+9 focus the first to ninth pane (Ctrl instead of Cmd off macOS). Listened for
// before the editor sees them.
export function useWorkspaceShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(IS_MAC ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return
      const s = useTabs.getState()
      if (e.code === 'Backslash') {
        const tab = focusedTab(s)
        if (!tab) return
        e.preventDefault()
        s.split(tab.id, 'right')
        focusPaneContent(useTabs.getState().focusedPaneId)
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const pane = panesOf(s.root)[Number(e.code.slice(5)) - 1]
        if (!pane) return
        e.preventDefault()
        s.focusPane(pane.id)
        focusPaneContent(pane.id)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}
