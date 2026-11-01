import { create } from 'zustand'

// Counters the sidebar's Saved queries and Recent queries views reload on: saving or opening a
// file bumps `files`, a finished run bumps `history`.
interface LibraryState {
  files: number
  history: number
  filesChanged(): void
  historyChanged(): void
}

export const useLibrary = create<LibraryState>()((set) => ({
  files: 0,
  history: 0,
  filesChanged: () => set((s) => ({ files: s.files + 1 })),
  historyChanged: () => set((s) => ({ history: s.history + 1 }))
}))
