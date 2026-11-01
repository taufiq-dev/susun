import { create } from 'zustand'
import type { ConnectionConfig, DbType, SavedConnectionInput } from '@shared/types'
import { useTabs } from './tabs'

// The open connection. App shows the connect screen while there is none.
export interface Session {
  connectionId: string
  name: string
  type: DbType
  // e.g. "shop on db.example.com:5432", or the SQLite file name.
  detail: string
  config: ConnectionConfig
  // The saved connection it is, if it is one.
  savedId?: string
}

// What the connect screen opens on after a connection closes: a connection's form (Edit
// Connection, or a switch to it that failed), with the error if connecting failed.
export interface ReturnTo {
  connection: SavedConnectionInput
  error?: string
}

interface SessionState {
  session: Session | null
  returnTo: ReturnTo | null
  open(session: Session): void
  close(returnTo?: ReturnTo): Promise<void>
}

export const useSession = create<SessionState>()((set, get) => ({
  session: null,
  returnTo: null,

  open: (session) => {
    useTabs.getState().reset()
    set({ session, returnTo: null })
  },

  close: async (returnTo) => {
    const { session } = get()
    if (!session) return
    set({ session: null, returnTo: returnTo ?? null })
    useTabs.getState().reset()
    try {
      await window.api.db.disconnect(session.connectionId)
    } catch (err) {
      console.error('disconnect failed:', (err as Error).message)
    }
  }
}))
