// Keyboard movement within a group that is a single Tab stop, such as a row of tabs or a list of
// tables: only its current item has tabIndex 0, the rest -1, and the arrow keys move the focus
// between them. Home and End go to the first and last.

const KEYS = {
  horizontal: { back: 'ArrowLeft', forward: 'ArrowRight' },
  vertical: { back: 'ArrowUp', forward: 'ArrowDown' }
}

// Handles a keydown inside `group`: moves the focus to the item before or after the focused one
// (wrapping around if `wrap`), or to the first or last, and returns it. Returns null, leaving the
// event alone, for any other key, or when the focus would stay put.
export function moveFocus(
  e: React.KeyboardEvent,
  group: HTMLElement,
  itemSelector: string,
  orientation: keyof typeof KEYS,
  wrap = false
): HTMLElement | null {
  const { back, forward } = KEYS[orientation]
  if (e.key !== back && e.key !== forward && e.key !== 'Home' && e.key !== 'End') return null
  const items = [...group.querySelectorAll<HTMLElement>(itemSelector)]
  const at = items.findIndex((item) => item === document.activeElement)
  let next: number
  if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = items.length - 1
  else {
    next = at + (e.key === forward ? 1 : -1)
    if (wrap) next = (next + items.length) % items.length
    else if (next < 0 || next >= items.length) return null
  }
  const item = items[next]
  if (!item || item === document.activeElement) return null
  e.preventDefault()
  item.focus()
  return item
}
