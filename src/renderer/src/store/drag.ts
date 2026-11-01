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

// The drag's data type, so drops of anything else (files, text) are ignored.
export const TAB_DRAG_TYPE = 'application/x-trowel-tab'
