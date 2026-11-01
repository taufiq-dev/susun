import { randomUUID } from 'crypto'
import { readFile, stat, writeFile } from 'fs/promises'
import { basename } from 'path'
import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type MessageBoxOptions,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type WebContents
} from 'electron'
import type {
  AppApi,
  ConnectionsApi,
  DbApi,
  DialogApi,
  FilesApi,
  HistoryApi,
  IpcResult,
  SaveChoice,
  SettingsApi,
  SqlFile
} from '@shared/api'
import type { ConnectionConfig } from '@shared/types'
import { listConnections, markUsed, removeConnection, saveConnection } from './connections'
import { createClient, type DbClient } from './db'
import { errorMessage } from './db/errors'
import {
  addHistory,
  clearHistory,
  connectionKey,
  forgetFile,
  hasFile,
  listFiles,
  listHistory,
  rememberFile
} from './library'
import { getSettings, setSettings } from './settings'
import { allowClose, closingToQuit } from './windows'

// The main-process side of an API group in @shared/api: the same methods, each also given the
// invoking event.
type Handlers<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (event: IpcMainInvokeEvent, ...args: A) => R
    : never
}

// An open connection: the config it was opened with, its own session's client (which the sidebar
// and table tabs use) and the ids of the sessions opened on it, which query tabs use.
interface OpenConnection {
  config: ConnectionConfig
  // What its query files and history are filed under (library.ts).
  key: string
  client: DbClient
  owner: WebContents
  sessions: Set<string>
}

interface OpenSession {
  client: DbClient
  connectionId: string
}

const openConnections = new Map<string, OpenConnection>()
const openSessions = new Map<string, OpenSession>()
const watchedOwners = new WeakSet<WebContents>()

// The client of a session, or of a connection's own session.
function findClient(id: string): DbClient | undefined {
  return openSessions.get(id)?.client ?? openConnections.get(id)?.client
}

// The library key of an open connection.
function keyOf(connectionId: string): string {
  const open = openConnections.get(connectionId)
  if (!open) throw new Error('Connection is closed')
  return open.key
}

function client(id: string): DbClient {
  const client = findClient(id)
  if (!client) throw new Error('Connection is closed')
  return client
}

function closeSession(sessionId: string): Promise<void> {
  const session = openSessions.get(sessionId)
  if (!session) return Promise.resolve()
  openSessions.delete(sessionId)
  openConnections.get(session.connectionId)?.sessions.delete(sessionId)
  return session.client.disconnect()
}

// Closes the connection's sessions along with it, all at once.
async function close(connectionId: string): Promise<void> {
  const open = openConnections.get(connectionId)
  if (!open) return
  openConnections.delete(connectionId)
  const results = await Promise.allSettled([
    open.client.disconnect(),
    ...[...open.sessions].map(closeSession)
  ])
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason
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
  async connect(event, config, savedId) {
    const client = createClient(config)
    await client.connect()
    const id = randomUUID()
    const key = connectionKey(config, savedId)
    openConnections.set(id, { config, key, client, owner: event.sender, sessions: new Set() })
    if (savedId) markUsed(savedId)
    watchOwner(event.sender)
    return id
  },
  disconnect: (_event, connectionId) => close(connectionId),
  async openSession(_event, connectionId) {
    const open = openConnections.get(connectionId)
    if (!open) throw new Error('Connection is closed')
    // A second connection to ':memory:' would be a new, empty database.
    if (open.config.type === 'sqlite' && open.config.file === ':memory:') return connectionId
    const client = createClient(open.config)
    await client.connect()
    // Disconnected (or the window closed) while this was connecting.
    if (openConnections.get(connectionId) !== open) {
      await client.disconnect()
      throw new Error('Connection is closed')
    }
    const id = randomUUID()
    openSessions.set(id, { client, connectionId })
    open.sessions.add(id)
    return id
  },
  closeSession: (_event, sessionId) => closeSession(sessionId),
  async applyChanges(_event, connectionId, statements) {
    const open = openConnections.get(connectionId)
    if (!open) throw new Error('Connection is closed')
    // An in-memory SQLite database exists only in the connection's own session.
    const shared = open.config.type === 'sqlite' && open.config.file === ':memory:'
    const client = shared ? open.client : createClient(open.config)
    if (!shared) await client.connect()
    try {
      await client.query('begin')
      for (const [i, { sql, params }] of statements.entries()) {
        const { rowCount } = await client.query(sql, params).catch((err: Error) => {
          throw new Error(`Row ${i + 1}: ${errorMessage(err)}`)
        })
        if (rowCount !== 1) {
          throw new Error(
            rowCount === 0
              ? `Row ${i + 1} wasn’t found: it may have been changed or deleted since it was read.`
              : `Row ${i + 1}: its key matched ${rowCount} rows.`
          )
        }
      }
      await client.query('commit')
    } catch (err) {
      await client.query('rollback').catch(() => {})
      throw err
    } finally {
      if (!shared) await client.disconnect().catch(() => {})
    }
  },
  listTables: (_event, connectionId) => client(connectionId).listTables(),
  listColumns: (_event, connectionId, table) => client(connectionId).listColumns(table),
  query: (_event, sessionId, sql, params) => client(sessionId).query(sql, params),
  cancel: async (_event, sessionId) => {
    await findClient(sessionId)?.cancel()
  }
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
  async confirm(event, message, detail, confirmLabel) {
    // macOS lays the buttons out right to left, so the action is on the right there.
    const buttons = [confirmLabel, 'Cancel']
    const { response } = await messageBox(event, {
      type: 'warning',
      message,
      detail,
      buttons,
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    return response === 0
  },
  async showError(event, message, detail) {
    await messageBox(event, { type: 'error', message, detail })
  },
  async openSqliteFile(event) {
    const window = BrowserWindow.fromWebContents(event.sender)
    const { canceled, filePaths } = window
      ? await dialog.showOpenDialog(window, SQLITE_FILE_DIALOG)
      : await dialog.showOpenDialog(SQLITE_FILE_DIALOG)
    return canceled ? null : (filePaths[0] ?? null)
  }
}

// A dialog attached to the window that asked for it (a sheet on macOS), if it still exists.
function messageBox(
  event: IpcMainInvokeEvent,
  options: MessageBoxOptions
): ReturnType<typeof dialog.showMessageBox> {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)
}

// The .sql files each window's user picked in an Open or Save dialog: the only ones
// `files.saveSql` writes without asking.
const pickedFiles = new WeakMap<WebContents, Set<string>>()

function pick(contents: WebContents, path: string): void {
  const picked = pickedFiles.get(contents) ?? new Set()
  picked.add(path)
  pickedFiles.set(contents, picked)
}

const SQL_FILTERS = [
  { name: 'SQL', extensions: ['sql'] },
  { name: 'All files', extensions: ['*'] }
]

// Larger files would make the editor slow to the point of hanging.
const MAX_SQL_BYTES = 20 * 1024 * 1024

// Reads a .sql file for a query tab, letting the window save to it and putting it on the
// connection's list. Resolves to null, having told the user why, if that fails.
async function readQueryFile(
  event: IpcMainInvokeEvent,
  path: string,
  connectionId: string | null
): Promise<SqlFile | null> {
  try {
    if ((await stat(path)).size > MAX_SQL_BYTES) throw new Error('The file is over 20 MB.')
    const sql = await readFile(path, 'utf8')
    pick(event.sender, path)
    if (connectionId) rememberFile(keyOf(connectionId), path)
    return { path, sql }
  } catch (err) {
    await messageBox(event, {
      type: 'error',
      message: `Couldn’t open “${basename(path)}”`,
      detail: errorMessage(err)
    })
    return null
  }
}

const files: Handlers<FilesApi> = {
  async openSql(event, connectionId) {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: 'Open query',
      properties: ['openFile'],
      filters: SQL_FILTERS
    }
    const { canceled, filePaths } = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const path = filePaths[0]
    if (canceled || !path) return null
    return readQueryFile(event, path, connectionId)
  },

  async readSql(event, connectionId, path) {
    if (!hasFile(keyOf(connectionId), path))
      throw new Error('That file isn’t on this connection’s list')
    return readQueryFile(event, path, connectionId)
  },

  async saveSql(event, sql, path, name, connectionId) {
    if (path && !pickedFiles.get(event.sender)?.has(path)) {
      throw new Error('That file wasn’t opened or saved in this window')
    }
    let target = path
    if (!target) {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: SaveDialogOptions = {
        title: 'Save query',
        defaultPath: name,
        filters: SQL_FILTERS
      }
      const { canceled, filePath } = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)
      if (canceled || !filePath) return null
      target = filePath
    }
    try {
      await writeFile(target, sql, 'utf8')
    } catch (err) {
      await messageBox(event, {
        type: 'error',
        message: `Couldn’t save “${basename(target)}”`,
        detail: errorMessage(err)
      })
      return null
    }
    pick(event.sender, target)
    if (connectionId) rememberFile(keyOf(connectionId), target)
    return target
  },

  list: (_event, connectionId) => listFiles(keyOf(connectionId)),
  forget: async (_event, connectionId, path) => forgetFile(keyOf(connectionId), path)
}

const history: Handlers<HistoryApi> = {
  list: async (_event, connectionId) => listHistory(keyOf(connectionId)),
  add: async (_event, connectionId, entry) => addHistory(keyOf(connectionId), entry),
  clear: async (_event, connectionId) => clearHistory(keyOf(connectionId))
}

const settings: Handlers<SettingsApi> = {
  get: async () => getSettings(),
  set: async (_event, changes) => setSettings(changes)
}

const IS_MAC = process.platform === 'darwin'

// The `on...` methods listen in preload; they aren't handlers.
type AppHandlersApi = Omit<AppApi, 'onCommand' | 'onSettingsChanged'>

const appHandlers: Handlers<AppHandlersApi> = {
  async confirmSave(event, titles, reason) {
    if (!getSettings().askToSaveQueries) return 'discard'
    const one = titles.length === 1
    const what = one ? `“${titles[0]}”` : `${titles.length} query tabs`
    const when =
      reason === 'disconnect'
        ? ' before disconnecting'
        : reason === 'switch'
          ? ' before switching connections'
          : reason === 'close-window'
            ? closingToQuit(event.sender)
              ? ' before quitting'
              : ' before closing the window'
            : ''
    const list = one ? '' : `${titles.map((t) => `• ${t}`).join('\n')}\n\n`
    // macOS lays the buttons out right to left: Save on the right, Don't Save on the far left.
    const save = one ? 'Save' : 'Save All'
    const choices: SaveChoice[] = IS_MAC
      ? ['save', 'cancel', 'discard']
      : ['save', 'discard', 'cancel']
    const labels: Record<SaveChoice, string> = { save, discard: 'Don’t Save', cancel: 'Cancel' }
    const { response, checkboxChecked } = await messageBox(event, {
      type: 'warning',
      message: `Do you want to save the changes to ${what}${when}?`,
      detail: `${list}Your changes will be lost if you don’t save them.`,
      buttons: choices.map((c) => labels[c]),
      defaultId: 0,
      cancelId: choices.indexOf('cancel'),
      checkboxLabel: 'Don’t ask again',
      noLink: true
    })
    const choice = choices[response] ?? 'cancel'
    if (checkboxChecked && choice !== 'cancel') setSettings({ askToSaveQueries: false })
    return choice
  },
  closeWindow: async (event) => allowClose(event.sender)
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
  handle<FilesApi>('files', files)
  handle<HistoryApi>('history', history)
  handle<SettingsApi>('settings', settings)
  handle<AppHandlersApi>('app', appHandlers)
}
