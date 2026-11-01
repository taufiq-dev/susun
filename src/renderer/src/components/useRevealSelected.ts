import { useEffect, type RefObject } from 'react'

// Scrolls a row of tabs sideways so its selected tab ([aria-selected=true]) is fully in view,
// whenever `key` changes: a tab opened past the right end of the row, or one chosen while partly
// hidden. Only the row scrolls (scrollIntoView could also scroll the panes around it).
export function useRevealSelected(list: RefObject<HTMLElement | null>, key: unknown): void {
  useEffect(() => {
    const row = list.current
    let tab = row?.querySelector<HTMLElement>('[aria-selected=true]')
    if (!row || !tab) return
    // The row's child holding it, which may include more than the tab (such as its close button).
    while (tab.parentElement && tab.parentElement !== row) tab = tab.parentElement
    const shown = row.getBoundingClientRect()
    const rect = tab.getBoundingClientRect()
    if (rect.left < shown.left) row.scrollBy({ left: rect.left - shown.left })
    else if (rect.right > shown.right) row.scrollBy({ left: rect.right - shown.right })
  }, [list, key])
}
