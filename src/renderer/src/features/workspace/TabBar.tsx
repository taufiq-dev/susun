import { useCallback, useRef, useState } from 'react'
import { ContextMenu, type MenuEntry } from '@renderer/components/ContextMenu'
import {
  CloseIcon,
  MaximizeIcon,
  PlusIcon,
  RestoreIcon,
  SplitRightIcon
} from '@renderer/components/icons'
import { IconButton } from '@renderer/components/ui'
import { useRevealSelected } from '@renderer/components/useRevealSelected'
import { endSession } from '@renderer/features/query/run'
import type { Pane } from '@renderer/store/panes'
import { useSession } from '@renderer/store/session'
import { useTabs, type Tab } from '@renderer/store/tabs'
import { MOD } from './shortcuts'

function tabTitle(tab: Tab): string {
  return tab.type === 'table' && tab.table.schema ? `${tab.table.schema}.${tab.title}` : tab.title
}

// A pane's tabs. `focused` marks the pane that New query and the sidebar act on, shown on its
// active tab when there are several panes.
export function TabBar({
  pane,
  focused,
  label
}: {
  pane: Pane
  focused: boolean
  label: string
}): React.JSX.Element {
  const allTabs = useTabs((s) => s.tabs)
  const tabs = pane.tabIds.flatMap((id) => allTabs.find((t) => t.id === id) ?? [])
  const activate = useTabs((s) => s.activate)
  const closeTab = useTabs((s) => s.close)
  const openQuery = useTabs((s) => s.openQuery)
  const split = useTabs((s) => s.split)
  const moveToNewPane = useTabs((s) => s.moveToNewPane)
  const toggleMaximize = useTabs((s) => s.toggleMaximize)
  // Maximizing needs another pane to hide.
  const several = useTabs((s) => s.root.type === 'split')
  const maximized = useTabs((s) => s.maximizedPaneId === pane.id)
  const connectionId = useSession((s) => s.session?.connectionId)
  const [menu, setMenu] = useState<{ x: number; y: number; tab: Tab } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const list = useRef<HTMLDivElement>(null)
  useRevealSelected(list, pane.activeId)

  const close = (id: string): void => {
    if (connectionId) endSession(connectionId, id)
    closeTab(id)
  }

  const menuItems = (tab: Tab): MenuEntry[] => {
    const alone = pane.tabIds.length < 2
    return [
      { label: 'Split right', shortcut: `${MOD}\\`, onSelect: () => split(tab.id, 'right') },
      { label: 'Split down', onSelect: () => split(tab.id, 'down') },
      'separator',
      {
        label: 'Move to a new pane on the right',
        disabled: alone,
        onSelect: () => moveToNewPane(tab.id, 'right')
      },
      {
        label: 'Move to a new pane below',
        disabled: alone,
        onSelect: () => moveToNewPane(tab.id, 'down')
      },
      'separator',
      {
        label: maximized ? 'Restore panes' : 'Maximize pane',
        disabled: !several,
        onSelect: () => toggleMaximize(pane.id)
      },
      'separator',
      { label: 'Close', onSelect: () => close(tab.id) }
    ]
  }

  const active = tabs.find((t) => t.id === pane.activeId)

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-sunken select-none">
      <div ref={list} role="tablist" aria-label={label} className="flex min-w-0 overflow-x-auto">
        {tabs.map((tab) => {
          const selected = tab.id === pane.activeId
          return (
            <div
              key={tab.id}
              role="presentation"
              className={`group flex max-w-52 shrink-0 items-center border-r border-line ${
                selected
                  ? `bg-surface text-ink ${focused ? 'shadow-[inset_0_2px_0_var(--accent)]' : 'shadow-[inset_0_2px_0_var(--line)]'}`
                  : 'text-muted hover:text-ink'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                title={tabTitle(tab)}
                onClick={() => activate(tab.id)}
                // Double-click maximizes the pane, or restores the layout, as in VS Code.
                onDoubleClick={() => several && toggleMaximize(pane.id)}
                // Middle-click closes, as in a browser.
                onAuxClick={(e) => {
                  if (e.button === 1) close(tab.id)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, tab })
                }}
                className="focus-ring h-full min-w-0 truncate pr-1 pl-3 text-left"
              >
                {tab.title}
              </button>
              <IconButton
                label={`Close ${tab.title}`}
                onClick={() => close(tab.id)}
                size="sm"
                className={`mr-1 ${selected ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
              >
                <CloseIcon />
              </IconButton>
            </div>
          )
        })}
      </div>
      <IconButton label="New query" onClick={() => openQuery(pane.id)} className="m-1">
        <PlusIcon />
      </IconButton>
      {several && (
        <IconButton
          label={maximized ? 'Restore panes' : 'Maximize pane'}
          title={
            maximized
              ? 'Restore panes (or double-click a tab)'
              : 'Maximize this pane (or double-click a tab)'
          }
          aria-pressed={maximized}
          onClick={() => toggleMaximize(pane.id)}
          className="my-1 ml-auto"
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </IconButton>
      )}
      <IconButton
        label="Split right"
        title={`Split right (${MOD}\\). Alt-click to split down.`}
        disabled={!active}
        onClick={(e) => active && split(active.id, e.altKey ? 'down' : 'right')}
        className={`my-1 mr-1 ${several ? '' : 'ml-auto'}`}
      >
        <SplitRightIcon />
      </IconButton>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={`${menu.tab.title} tab`}
          items={menuItems(menu.tab)}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}
