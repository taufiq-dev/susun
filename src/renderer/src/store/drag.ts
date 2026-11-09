import { create } from 'zustand'

// The tab being dragged, if one is: tab bars show where it would go, and panes their drop zones.
interface DragState {
  tabId: string | null
  start(tabId: string): void
  end(): void
}

export const useDrag = create<DragState>()((set) => ({
  tabId: null,
  start: (tabId) => set({ tabId }),
  end: () => set({ tabId: null })
}))

// Ends the drag. A drop calls it as well as the dragged tab's dragend: a tab dropped into another
// pane is a new element there, and the old one is gone before its dragend, which React then never
// sees. A drag left on would keep each pane's drop zones over its content, taking its clicks.
export function endTabDrag(): void {
  useDrag.getState().end()
}

// The drag's data type, so drops of anything else (files, text) are ignored.
export const TAB_DRAG_TYPE = 'application/x-susun-tab'
