import { randomUUID } from 'crypto'
import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type WebContents
} from 'electron'
import type { ConnectionsApi, DbApi, DialogApi, IpcResult } from '@shared/api'
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

const SQLITE_FILE_DIALOG: OpenDialogOptions = {
  title: 'Open SQLite database',
  properties: ['openFile'],
  filters: [
    { name: 'SQLite databases', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
    { name: 'All files', extensions: ['*'] }
  ]
}

const dialogs: Handlers<DialogApi> = {
  async openSqliteFile(event) {
    const window = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = window
      ? await dialog.showOpenDialog(window, SQLITE_FILE_DIALOG)
      : await dialog.showOpenDialog(SQLITE_FILE_DIALOG)
    return canceled ? null : (filePaths[0] ?? null)
  }
}

// Connecting to "localhost" tries ::1 and 127.0.0.1, and if both fail Node throws an
// AggregateError with an empty message; its inner errors say what happened.
function errorMessage(err: unknown): string {
  if (err instanceof AggregateError && !err.message) {
    return err.errors.map(errorMessage).join('; ')
  }
  if (err instanceof Error) return err.message || err.name
  return String(err)
}

function handle<T>(group: string, handlers: Handlers<T>): void {
  for (const [method, fn] of Object.entries(handlers)) {
    const handler = fn as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    ipcMain.handle(`${group}:${method}`, async (event, ...args): Promise<IpcResult<unknown>> => {
      try {
        return { ok: true, value: await handler(event, ...args) }
      } catch (err) {
        return { ok: false, message: errorMessage(err) }
      }
    })
  }
}

export function registerIpc(): void {
  handle<DbApi>('db', db)
  handle<ConnectionsApi>('connections', connections)
  handle<DialogApi>('dialog', dialogs)
}
