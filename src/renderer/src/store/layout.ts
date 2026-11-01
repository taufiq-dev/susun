import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// The side panels beside the main area, with their default and minimum widths in pixels.
export const SIDE_PANELS = {
  // The saved connections, on the connect screen.
  connections: { width: 256, min: 180 },
  tables: { width: 240, min: 160 },
  row: { width: 288, min: 200 }
}

export type SidePanelId = keyof typeof SIDE_PANELS

type Widths = Record<SidePanelId, number>

const DEFAULT_WIDTHS = Object.fromEntries(
  Object.entries(SIDE_PANELS).map(([id, panel]) => [id, panel.width])
) as Widths

interface LayoutState {
  widths: Widths
  setWidth(id: SidePanelId, width: number): void
}

// The side panels' widths as last dragged, kept in localStorage between launches.
export const useLayout = create<LayoutState>()(
  persist(
    (set) => ({
      widths: DEFAULT_WIDTHS,
      setWidth: (id, width) => set((s) => ({ widths: { ...s.widths, [id]: width } }))
    }),
    {
      name: 'trowel-layout',
      partialize: (s) => ({ widths: s.widths }),
      // Takes the saved widths that are numbers, keeping the defaults for any others (such as a
      // panel added since they were saved).
      merge: (saved, current) => {
        const widths = { ...current.widths }
        const savedWidths = (saved as { widths?: Record<string, unknown> } | undefined)?.widths
        for (const id of Object.keys(widths) as SidePanelId[]) {
          const width = savedWidths?.[id]
          if (typeof width === 'number' && Number.isFinite(width)) widths[id] = width
        }
        return { ...current, widths }
      }
    }
  )
)
