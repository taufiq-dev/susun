import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// The side panels beside the main area, with their default and minimum widths in pixels.
export const SIDE_PANELS = {
  // The saved connections, on the connect screen.
  connections: { width: 256, min: 180 },
  // The workspace's left side: the activity bar and its view (tables, saved queries, history).
  sidebar: { width: 288, min: 216 },
  row: { width: 288, min: 200 }
}

export type SidePanelId = keyof typeof SIDE_PANELS

type Widths = Record<SidePanelId, number>

const DEFAULT_WIDTHS = Object.fromEntries(
  Object.entries(SIDE_PANELS).map(([id, panel]) => [id, panel.width])
) as Widths

// What the sidebar shows, chosen in its activity bar.
export type SidebarView = 'tables' | 'saved' | 'history'

const SIDEBAR_VIEWS: SidebarView[] = ['tables', 'saved', 'history']

interface LayoutState {
  widths: Widths
  sidebarView: SidebarView
  setWidth(id: SidePanelId, width: number): void
  setSidebarView(view: SidebarView): void
}

// The side panels' widths as last dragged, kept in localStorage between launches.
export const useLayout = create<LayoutState>()(
  persist(
    (set) => ({
      widths: DEFAULT_WIDTHS,
      sidebarView: 'tables',
      setWidth: (id, width) => set((s) => ({ widths: { ...s.widths, [id]: width } })),
      setSidebarView: (sidebarView) => set({ sidebarView })
    }),
    {
      name: 'trowel-layout',
      partialize: (s) => ({ widths: s.widths, sidebarView: s.sidebarView }),
      // Takes the saved widths that are numbers and a known view, keeping the defaults for the rest
      // (such as a panel added since they were saved).
      merge: (saved, current) => {
        const { widths: savedWidths, sidebarView } =
          (saved as { widths?: Record<string, unknown>; sidebarView?: unknown } | undefined) ?? {}
        const widths = { ...current.widths }
        for (const id of Object.keys(widths) as SidePanelId[]) {
          const width = savedWidths?.[id]
          if (typeof width === 'number' && Number.isFinite(width)) widths[id] = width
        }
        const view = SIDEBAR_VIEWS.find((v) => v === sidebarView) ?? current.sidebarView
        return { ...current, widths, sidebarView: view }
      }
    }
  )
)
