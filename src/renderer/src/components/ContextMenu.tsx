import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
  // Shown on the right, e.g. "⌘\".
  shortcut?: string
}

export type MenuEntry = MenuItem | 'separator'

const WIDTH = 248
const ITEM_HEIGHT = 28
const SEPARATOR_HEIGHT = 9
const PADDING = 8
const MARGIN = 4

// A menu at the pointer, as a right-click opens. It closes on a choice, Escape, a click elsewhere,
// or the window losing focus or resizing. A choice or Escape returns the focus to where it was
// before the menu opened (a choice first, so an action that moves the focus itself still can).
// Kept inside the window, using its known size rather than measuring it.
export function ContextMenu({
  x,
  y,
  label,
  items,
  onClose
}: {
  x: number
  y: number
  label: string
  items: MenuEntry[]
  // Must keep its identity between renders (e.g. from useCallback).
  onClose: () => void
}): React.JSX.Element {
  const menu = useRef<HTMLDivElement>(null)
  // What had the focus before the menu took it.
  const previous = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onPointerDown = (e: PointerEvent): void => {
      if (!menu.current?.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      previous.current?.focus()
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    menu.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus()
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  // Up and down move between the items that can be chosen, wrapping around.
  const move = (e: React.KeyboardEvent): void => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!step || !menu.current) return
    e.preventDefault()
    const enabled = [
      ...menu.current.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')
    ]
    const at = enabled.indexOf(document.activeElement as HTMLElement)
    enabled[(at + step + enabled.length) % enabled.length]?.focus()
  }

  const height = items.reduce(
    (h, item) => h + (item === 'separator' ? SEPARATOR_HEIGHT : ITEM_HEIGHT),
    PADDING
  )
  const left = Math.max(MARGIN, Math.min(x, window.innerWidth - WIDTH - MARGIN))
  const top = Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN))

  return (
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      onKeyDown={move}
      style={{ left, top, width: WIDTH }}
      className="fixed z-50 rounded-[6px] border border-line bg-surface py-1 text-[13px] shadow-lg select-none app-no-drag"
    >
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} role="separator" className="my-1 h-px bg-line" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              previous.current?.focus()
              onClose()
              item.onSelect()
            }}
            className="flex h-7 w-full items-center justify-between gap-4 px-3 text-left outline-none hover:bg-ink/10 focus-visible:bg-ink/10 disabled:opacity-45"
          >
            <span className="truncate">{item.label}</span>
            {item.shortcut && <span className="text-[11px] text-muted">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
}
