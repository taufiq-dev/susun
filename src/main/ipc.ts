import { randomUUID } from 'crypto'
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { ConnectionsApi, DbApi, IpcResult } from '@shared/api'
import { listConnections, removeConnection, saveConnection } from './connections'
import { createClient, type DbClient } from './db'

// The main-process side of an API group in @shared/api: the same methods, each also given the
// invoking event.
type Handlers<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (event: IpcMainInvokeEvent, ...args: A) => R
    : never
}

interface OpenConnection {
  client: DbClient
  owner: WebContents
}

const openConnections = new Map<string, OpenConnection>()
const watchedOwners = new WeakSet<WebContents>()

function client(connectionId: string): DbClient {
  const open = openConnections.get(connectionId)
  if (!open) throw new Error('Connection is closed')
  return open.client
}

function close(connectionId: string): Promise<void> {
  const open = openConnections.get(connectionId)
  if (!open) return Promise.resolve()
  openConnections.delete(connectionId)
  return open.client.disconnect()
}

// A window that closes or reloads loses its connection ids, so close its connections with it.
function watchOwner(owner: WebContents): void {
  if (watchedOwners.has(owner)) return
  watchedOwners.add(owner)
  const closeAll = (): void => {
    for (const [id, open] of openConnections) {
      if (open.owner !== owner) continue
      close(id).catch((err) => console.error('disconnect failed:', err.message))
    }
  }
  owner.on('destroyed', closeAll)
  owner.on('did-navigate', closeAll)
}

const db: Handlers<DbApi> = {
  async connect(event, config) {
    const client = createClient(config)
    await client.connect()
    const id = randomUUID()
    openConnections.set(id, { client, owner: event.sender })
    watchOwner(event.sender)
    return id
  },
  disconnect: (_event, connectionId) => close(connectionId),
  listTables: (_event, connectionId) => client(connectionId).listTables(),
  listColumns: (_event, connectionId, table) => client(connectionId).listColumns(table),
  query: (_event, connectionId, sql, params) => client(connectionId).query(sql, params)
}

const connections: Handlers<ConnectionsApi> = {
  list: () => listConnections(),
  save: (_event, connection) => saveConnection(connection),
  remove: (_event, id) => removeConnection(id)
}

function handle<T>(group: string, handlers: Handlers<T>): void {
  for (const [method, fn] of Object.entries(handlers)) {
    const handler = fn as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    ipcMain.handle(`${group}:${method}`, async (event, ...args): Promise<IpcResult<unknown>> => {
      try {
        return { ok: true, value: await handler(event, ...args) }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    })
  }
}

export function registerIpc(): void {
  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  handle<DbApi>('db', db)
  handle<ConnectionsApi>('connections', connections)
}
