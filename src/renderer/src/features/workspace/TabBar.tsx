import { useRef, useState } from 'react'
import {
  CloseIcon,
  MaximizeIcon,
  PlusIcon,
  RestoreIcon,
  SplitRightIcon
} from '@renderer/components/icons'
import { moveFocus } from '@renderer/components/roving'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@renderer/components/shadcn/context-menu'
import { IconButton } from '@renderer/components/ui'
import { useRevealSelected } from '@renderer/components/useRevealSelected'
import type { Pane } from '@renderer/store/panes'
import { endTabDrag, TAB_DRAG_TYPE, useDrag } from '@renderer/store/drag'
import { useSession } from '@renderer/store/session'
import { useTabs, type Tab } from '@renderer/store/tabs'
import { closeTab, isUnsaved } from './closing'
import { MOD, focusPaneContent } from './shortcuts'

// Once a tab closed from the keyboard is gone: focuses the tab now active in its pane, or the
// focused pane's content if it was the pane's last tab.
function focusActiveTab(paneId: string): void {
  requestAnimationFrame(() => {
    const tab = document.querySelector<HTMLElement>(
      `[data-pane="${CSS.escape(paneId)}"] [role=tab][aria-selected=true]`
    )
    if (tab) tab.focus()
    else focusPaneContent(useTabs.getState().focusedPaneId)
  })
}

// After a split or move from the menu or the Split button, as after Cmd+\: the new pane's content.
function focusFocusedPane(): void {
  focusPaneContent(useTabs.getState().focusedPaneId)
}

// A tab's tooltip: a query file's path, or a table's schema-qualified name.
function tabTitle(tab: Tab): string {
  if (tab.type === 'query') return tab.file?.path ?? tab.title
  const name = tab.table.schema ? `${tab.table.schema}.${tab.table.name}` : tab.table.name
  return tab.type === 'diagram' ? `ER diagram of ${name}` : name
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
  const openQuery = useTabs((s) => s.openQuery)
  const split = useTabs((s) => s.split)
  const moveToNewPane = useTabs((s) => s.moveToNewPane)
  const toggleMaximize = useTabs((s) => s.toggleMaximize)
  // Maximizing needs another pane to hide.
  const several = useTabs((s) => s.root.type === 'split')
  const maximized = useTabs((s) => s.maximizedPaneId === pane.id)
  const connectionId = useSession((s) => s.session?.connectionId)
  const list = useRef<HTMLDivElement>(null)
  useRevealSelected(list, pane.activeId)
  const moveTab = useTabs((s) => s.moveTab)
  const dragging = useDrag((s) => s.tabId)
  // Where a dragged tab would land among this bar's tabs, while it's over the bar.
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // The place among the tabs nearest the pointer: before the first tab whose middle is past it.
  const indexAt = (clientX: number): number => {
    const tabEls = [...(list.current?.children ?? [])]
    const i = tabEls.findIndex((el) => {
      const r = el.getBoundingClientRect()
      return clientX < r.left + r.width / 2
    })
    return i === -1 ? tabEls.length : i
  }

  // Closes the tab once any unsaved SQL is dealt with (see closing.ts); `then` runs if it closed.
  const close = (id: string, then?: () => void): void => {
    if (!connectionId) return
    void closeTab(connectionId, id).then((closed) => closed && then?.())
  }

  // A tab's right-click menu (shadcn's ContextMenu).
  const menu = (tab: Tab): React.JSX.Element => {
    const alone = pane.tabIds.length < 2
    return (
      <ContextMenuContent aria-label={`${tab.title} tab`}>
        <ContextMenuItem
          onClick={() => {
            split(tab.id, 'right')
            focusFocusedPane()
          }}
        >
          Split right
          <ContextMenuShortcut>{`${MOD}\\`}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            split(tab.id, 'down')
            focusFocusedPane()
          }}
        >
          Split down
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={alone}
          onClick={() => {
            moveToNewPane(tab.id, 'right')
            focusFocusedPane()
          }}
        >
          Move to a new pane on the right
        </ContextMenuItem>
        <ContextMenuItem
          disabled={alone}
          onClick={() => {
            moveToNewPane(tab.id, 'down')
            focusFocusedPane()
          }}
        >
          Move to a new pane below
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!several} onClick={() => toggleMaximize(pane.id)}>
          {maximized ? 'Restore panes' : 'Maximize pane'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => close(tab.id, focusFocusedPane)}>Close</ContextMenuItem>
      </ContextMenuContent>
    )
  }

  const active = tabs.find((t) => t.id === pane.activeId)

  return (
    // Dropping a dragged tab here moves it to that place in this pane (or reorders it).
    <div
      onDragOver={(e) => {
        if (!dragging || !e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropIndex(indexAt(e.clientX))
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropIndex(null)
      }}
      onDrop={(e) => {
        const tabId = e.dataTransfer.getData(TAB_DRAG_TYPE)
        setDropIndex(null)
        endTabDrag()
        if (!tabId) return
        e.preventDefault()
        moveTab(tabId, pane.id, indexAt(e.clientX))
        focusPaneContent(pane.id)
      }}
      className="flex h-9 shrink-0 items-stretch border-b border-line bg-sunken select-none"
    >
      {/* One Tab stop, the active tab; the arrow keys move between tabs, and Enter or Space opens one. */}
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        onKeyDown={(e) => moveFocus(e, e.currentTarget, '[role=tab]', 'horizontal', true)}
        className="flex min-w-0 overflow-x-auto"
      >
        {tabs.map((tab, i) => {
          const selected = tab.id === pane.activeId
          // The line where a dragged tab would land: before this tab, or after the last.
          const dropBefore = dropIndex === i
          const dropAfter = dropIndex === tabs.length && i === tabs.length - 1
          // Unsaved SQL or rows show as a dot where the close button is, until the tab is hovered.
          const dirty = isUnsaved(tab)
          return (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger
                role="presentation"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(TAB_DRAG_TYPE, tab.id)
                  e.dataTransfer.effectAllowed = 'move'
                  useDrag.getState().start(tab.id)
                }}
                onDragEnd={() => {
                  endTabDrag()
                  setDropIndex(null)
                }}
                className={`group relative flex max-w-52 shrink-0 items-center border-r border-line ${
                  dropBefore
                    ? 'before:absolute before:inset-y-1 before:-left-px before:w-0.5 before:bg-accent'
                    : ''
                } ${
                  dropAfter
                    ? 'after:absolute after:inset-y-1 after:-right-px after:w-0.5 after:bg-accent'
                    : ''
                } ${
                  selected
                    ? `bg-surface text-ink ${focused ? 'shadow-[inset_0_2px_0_var(--accent)]' : 'shadow-[inset_0_2px_0_var(--line)]'}`
                    : 'text-muted hover:text-ink'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  title={tabTitle(tab)}
                  onClick={() => activate(tab.id)}
                  // Delete (or Backspace) closes the focused tab, as its close button isn't a Tab stop.
                  onKeyDown={(e) => {
                    if (e.key !== 'Delete' && e.key !== 'Backspace') return
                    e.preventDefault()
                    close(tab.id, () => focusActiveTab(pane.id))
                  }}
                  // Double-click maximizes the pane, or restores the layout, as in VS Code.
                  onDoubleClick={() => several && toggleMaximize(pane.id)}
                  // Middle-click closes, as in a browser.
                  onAuxClick={(e) => {
                    if (e.button === 1) close(tab.id)
                  }}
                  className="focus-ring h-full min-w-0 truncate pr-1 pl-3 text-left"
                >
                  {tab.title}
                </button>
                <IconButton
                  label={dirty ? `Close ${tab.title} (unsaved changes)` : `Close ${tab.title}`}
                  onClick={() => close(tab.id)}
                  tabIndex={-1}
                  size="sm"
                  className={`mr-1 ${selected || dirty ? '' : 'opacity-0 group-hover:opacity-100'}`}
                >
                  {dirty ? (
                    <>
                      <span className="size-2 rounded-full bg-current group-hover:hidden" />
                      <span className="hidden group-hover:contents">
                        <CloseIcon />
                      </span>
                    </>
                  ) : (
                    <CloseIcon />
                  )}
                </IconButton>
              </ContextMenuTrigger>
              {menu(tab)}
            </ContextMenu>
          )
        })}
      </div>
      <IconButton label="New query" onClick={() => openQuery(pane.id)} className="m-1">
        <PlusIcon />
      </IconButton>
      {several && (
        <IconButton
          label={maximized ? 'Restore panes' : 'Maximize pane'}
          tooltip={
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
        tooltip={`Split right (${MOD}\\). Alt-click to split down.`}
        disabled={!active}
        onClick={(e) => {
          if (!active) return
          split(active.id, e.altKey ? 'down' : 'right')
          focusFocusedPane()
        }}
        className={`my-1 mr-1 ${several ? '' : 'ml-auto'}`}
      >
        <SplitRightIcon />
      </IconButton>
    </div>
  )
}
