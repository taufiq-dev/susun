import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRightIcon } from './icons'

export interface MenuItem {
  label: string
  // An item with a submenu needs none: choosing it opens the submenu.
  onSelect?: () => void
  disabled?: boolean
  // Shown on the right, e.g. "⌘\".
  shortcut?: string
  icon?: ReactNode
  // A menu beside this one, opened by hovering the item, or by Right, Enter or Space on it.
  submenu?: MenuEntry[]
}

// A section's title within a menu, which can't be chosen.
export interface MenuHeading {
  heading: string
}

export type MenuEntry = MenuItem | MenuHeading | 'separator'

const WIDTH = 248
const ITEM_HEIGHT = 28
const HEADING_HEIGHT = 26
const SEPARATOR_HEIGHT = 9
const PADDING = 8
const MARGIN = 4
// How long the pointer can be over another item before an open submenu closes, so moving
// diagonally from its item into it doesn't close it on the way.
const SUBMENU_CLOSE_DELAY = 300

function isItem(entry: MenuEntry): entry is MenuItem {
  return entry !== 'separator' && !('heading' in entry)
}

function heightOf(entries: MenuEntry[]): number {
  return entries.reduce(
    (h, entry) =>
      h + (entry === 'separator' ? SEPARATOR_HEIGHT : isItem(entry) ? ITEM_HEIGHT : HEADING_HEIGHT),
    PADDING
  )
}

// The items of one list (the menu, or its submenu) that can be chosen, in order.
function enabledItems(list: Element): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>(':scope > [role=menuitem]:not(:disabled)')]
}

interface Submenu {
  // Its item's index in the menu.
  index: number
  left: number
  top: number
}

// A menu at a point, as a right-click opens (or, with `above`, ending just above it, as a button
// at the bottom of the window opens one). It closes on a choice, Escape, a click elsewhere, or the
// window losing focus or resizing. A choice or Escape returns the focus to where it was before the
// menu opened (a choice first, so an action that moves the focus itself still can). Kept inside
// the window, using its known size rather than measuring it. Submenus go one level deep.
export function ContextMenu({
  x,
  y,
  above = false,
  label,
  items,
  onClose
}: {
  x: number
  y: number
  above?: boolean
  label: string
  items: MenuEntry[]
  // Must keep its identity between renders (e.g. from useCallback).
  onClose: () => void
}): React.JSX.Element {
  const menu = useRef<HTMLDivElement>(null)
  // What had the focus before the menu took it.
  const previous = useRef<HTMLElement | null>(null)
  const [submenu, setSubmenu] = useState<Submenu | null>(null)
  // The submenu as the key listener sees it.
  const openSubmenu = useRef<Submenu | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    openSubmenu.current = submenu
  }, [submenu])

  // Closes the submenu, moving the focus back to its item if it was inside.
  const closeSubmenu = (): void => {
    window.clearTimeout(closeTimer.current)
    const open = openSubmenu.current
    if (!open) return
    const inside = menu.current?.querySelector('[data-submenu]')?.contains(document.activeElement)
    setSubmenu(null)
    if (inside) menu.current?.querySelectorAll<HTMLElement>(':scope > *')[open.index]?.focus()
  }
  const closeSubmenuRef = useRef(closeSubmenu)
  useEffect(() => {
    closeSubmenuRef.current = closeSubmenu
  })

  useEffect(() => {
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onPointerDown = (e: PointerEvent): void => {
      if (!menu.current?.contains(e.target as Node)) onClose()
    }
    // Escape closes the submenu if it is open, or else the menu.
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      if (openSubmenu.current) {
        closeSubmenuRef.current()
        return
      }
      previous.current?.focus()
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    if (menu.current) enabledItems(menu.current)[0]?.focus()
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.clearTimeout(closeTimer.current)
    }
  }, [onClose])

  const choose = (item: MenuItem): void => {
    previous.current?.focus()
    onClose()
    item.onSelect?.()
  }

  // Opens the submenu of the item at `index`, beside it (on the left if there's no room on the
  // right), and with `focus` moves the focus into it.
  const showSubmenu = (index: number, element: HTMLElement, focus: boolean): void => {
    window.clearTimeout(closeTimer.current)
    const entry = items[index]
    if (!isItem(entry) || !entry.submenu) return
    const rect = element.getBoundingClientRect()
    const right = rect.right + 2
    const left = right + WIDTH + MARGIN <= window.innerWidth ? right : rect.left - WIDTH - 2
    const height = heightOf(entry.submenu)
    const top = Math.max(
      MARGIN,
      Math.min(rect.top - PADDING / 2, window.innerHeight - height - MARGIN)
    )
    setSubmenu({ index, left: Math.max(MARGIN, left), top })
    if (focus) {
      requestAnimationFrame(() => {
        const list = menu.current?.querySelector('[data-submenu]')
        if (list) enabledItems(list)[0]?.focus()
      })
    }
  }

  // Up and down move between a list's items, wrapping around; Right opens an item's submenu and
  // Left (in a submenu) closes it.
  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, inSubmenu: boolean): void => {
    const list = e.currentTarget
    if (e.key === 'ArrowLeft' && inSubmenu) {
      e.preventDefault()
      e.stopPropagation()
      closeSubmenu()
      return
    }
    if (e.key === 'ArrowRight' && !inSubmenu) {
      const element = document.activeElement as HTMLElement
      const index = [...list.children].indexOf(element)
      if (index >= 0) {
        e.preventDefault()
        showSubmenu(index, element, true)
      }
      return
    }
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    e.stopPropagation()
    const enabled = enabledItems(list)
    const at = enabled.indexOf(document.activeElement as HTMLElement)
    enabled[(at + step + enabled.length) % enabled.length]?.focus()
  }

  const height = heightOf(items)
  const left = Math.max(MARGIN, Math.min(x, window.innerWidth - WIDTH - MARGIN))
  const top = Math.max(
    MARGIN,
    Math.min(above ? y - height : y, window.innerHeight - height - MARGIN)
  )
  const open = submenu && items[submenu.index]

  return (
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      onKeyDown={(e) => onListKeyDown(e, false)}
      style={{ left, top, width: WIDTH }}
      className={MENU}
    >
      {items.map((entry, i) => (
        <Entry
          key={i}
          entry={entry}
          icons={items.some((e) => isItem(e) && e.icon)}
          expanded={submenu?.index === i}
          onChoose={(element) => {
            if (isItem(entry) && entry.submenu) showSubmenu(i, element, true)
            else if (isItem(entry)) choose(entry)
          }}
          onPointerEnter={(element) => {
            if (isItem(entry) && entry.submenu) showSubmenu(i, element, false)
            else if (submenu) {
              window.clearTimeout(closeTimer.current)
              closeTimer.current = window.setTimeout(closeSubmenu, SUBMENU_CLOSE_DELAY)
            }
          }}
        />
      ))}
      {open && isItem(open) && open.submenu && (
        <div
          data-submenu
          role="menu"
          aria-label={open.label}
          onKeyDown={(e) => onListKeyDown(e, true)}
          onPointerEnter={() => window.clearTimeout(closeTimer.current)}
          style={{ left: submenu.left, top: submenu.top, width: WIDTH }}
          className={MENU}
        >
          {open.submenu.map((entry, i) => (
            <Entry
              key={i}
              entry={entry}
              icons={open.submenu?.some((e) => isItem(e) && e.icon) ?? false}
              expanded={false}
              onChoose={() => isItem(entry) && choose(entry)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const MENU =
  'fixed z-50 rounded-[6px] border border-line bg-surface py-1 text-[13px] shadow-lg select-none app-no-drag'

function Entry({
  entry,
  icons,
  expanded,
  onChoose,
  onPointerEnter
}: {
  entry: MenuEntry
  // Whether the list has icons, so every item leaves room for one.
  icons: boolean
  // Its submenu is open.
  expanded: boolean
  onChoose: (element: HTMLElement) => void
  onPointerEnter?: (element: HTMLElement) => void
}): React.JSX.Element {
  if (entry === 'separator') return <div role="separator" className="my-1 h-px bg-line" />
  if (!isItem(entry)) {
    return (
      <div className="flex h-[26px] items-end px-3 pb-1 text-[11px] text-muted">
        {entry.heading}
      </div>
    )
  }
  return (
    <button
      type="button"
      role="menuitem"
      disabled={entry.disabled}
      aria-haspopup={entry.submenu ? 'menu' : undefined}
      aria-expanded={entry.submenu ? expanded : undefined}
      onClick={(e) => onChoose(e.currentTarget)}
      onPointerEnter={(e) => onPointerEnter?.(e.currentTarget)}
      className={`flex h-7 w-full items-center gap-2.5 px-3 text-left outline-none hover:bg-ink/10 focus-visible:bg-ink/10 disabled:opacity-45 ${
        expanded ? 'bg-ink/10' : ''
      }`}
    >
      {icons && <span className="flex w-4 shrink-0 justify-center text-muted">{entry.icon}</span>}
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {entry.shortcut && <span className="text-[11px] text-muted">{entry.shortcut}</span>}
      {entry.submenu && (
        <span className="text-muted">
          <ChevronRightIcon />
        </span>
      )}
    </button>
  )
}
