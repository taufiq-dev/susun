import { create } from 'zustand'

interface LayoutState {
  // The query editor's share of a query tab's height; the results get the rest. Shared by all
  // query tabs.
  editorFraction: number
  setEditorFraction(fraction: number): void
}

export const useLayout = create<LayoutState>()((set) => ({
  editorFraction: 0.4,
  setEditorFraction: (fraction) => set({ editorFraction: Math.min(0.85, Math.max(0.15, fraction)) })
}))
