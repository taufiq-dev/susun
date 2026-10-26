import { create } from 'zustand'
import type { DbType } from '@shared/types'
import { useTabs } from './tabs'

// The open connection. App shows the connect screen while there is none.
export interface Session {
  connectionId: string
  name: string
  type: DbType
  // e.g. "shop on db.example.com:5432", or the SQLite file name.
  detail: string
}

interface SessionState {
  session: Session | null
  open(session: Session): void
  close(): Promise<void>
}

export const useSession = create<SessionState>()((set, get) => ({
  session: null,

  open: (session) => {
    useTabs.getState().reset()
    set({ session })
  },

  close: async () => {
    const { session } = get()
    if (!session) return
    set({ session: null })
    useTabs.getState().reset()
    try {
      await window.api.db.disconnect(session.connectionId)
    } catch (err) {
      console.error('disconnect failed:', (err as Error).message)
    }
  }
}))
