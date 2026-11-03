import type { SavedConnection } from '@shared/types'
import { describe } from '@renderer/features/connect/draft'
import { useSession } from '@renderer/store/session'
import { settleUnsaved } from './closing'

// The connection bar's actions. Those that leave the connection first ask about query tabs with
// unsaved SQL, since every tab closes.

export async function disconnect(): Promise<void> {
  if (await settleUnsaved('disconnect')) await useSession.getState().close()
}

// Connects again after the connection was lost, without waiting for it to be needed. Query tabs
// reconnect on their next run.
export async function reconnect(): Promise<void> {
  const session = useSession.getState().session
  if (!session) return
  try {
    await window.api.db.reconnect(session.connectionId)
  } catch (err) {
    await window.api.dialog.showError(
      `Couldn’t reconnect to ${session.name}`,
      (err as Error).message
    )
  }
}

// Disconnects and opens this connection's form on the connect screen.
export async function editConnection(): Promise<void> {
  const session = useSession.getState().session
  if (!session || !(await settleUnsaved('disconnect'))) return
  const { savedId: id, name, config } = session
  await useSession.getState().close({ connection: { id, name, config } })
}

// Disconnects, back to the connect screen and its list of saved connections.
export async function showAllConnections(): Promise<void> {
  await disconnect()
}

// Connects to the saved connection, and only then leaves this one, so there's no blank moment on
// the connect screen. If connecting fails, this one closes anyway (its tabs have been dealt with)
// and the connect screen opens on the other one's form with the error. `onConnecting` runs once
// the user has let the tabs go, as connecting may take a while.
export async function switchConnection(
  target: SavedConnection,
  onConnecting: () => void
): Promise<void> {
  const current = useSession.getState().session
  if (!current || !(await settleUnsaved('switch'))) return
  onConnecting()
  let connectionId: string
  try {
    connectionId = await window.api.db.connect(target.config, target.id)
  } catch (err) {
    await useSession.getState().close({ connection: target, error: (err as Error).message })
    return
  }
  useSession.getState().open({
    connectionId,
    name: target.name,
    type: target.config.type,
    detail: describe(target.config),
    config: target.config,
    savedId: target.id
  })
  window.api.db.disconnect(current.connectionId).catch((err: Error) => {
    console.error('disconnect failed:', err.message)
  })
}
