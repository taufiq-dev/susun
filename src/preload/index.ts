import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Api, AppEvents, IpcResult } from '@shared/api'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result: IpcResult<T> = await ipcRenderer.invoke(channel, ...args)
  if (!result.ok) throw new Error(result.message)
  return result.value
}

// Calls `listener` with each message the main process sends on the channel, until the returned
// function is called. The listener isn't given the IPC event, which would expose ipcRenderer.
function listen<C extends keyof AppEvents>(
  channel: C,
  listener: (value: AppEvents[C]) => void
): () => void {
  const handler = (_event: IpcRendererEvent, value: AppEvents[C]): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

// Custom APIs for renderer
const api: Api = {
  db: {
    connect: (config, savedId) => invoke('db:connect', config, savedId),
    disconnect: (connectionId) => invoke('db:disconnect', connectionId),
    reconnect: (connectionId) => invoke('db:reconnect', connectionId),
    openSession: (connectionId) => invoke('db:openSession', connectionId),
    closeSession: (sessionId) => invoke('db:closeSession', sessionId),
    applyChanges: (connectionId, statements) => invoke('db:applyChanges', connectionId, statements),
    listTables: (connectionId) => invoke('db:listTables', connectionId),
    listColumns: (connectionId, table) => invoke('db:listColumns', connectionId, table),
    listColumnsOf: (connectionId, tables) => invoke('db:listColumnsOf', connectionId, tables),
    listForeignKeys: (connectionId) => invoke('db:listForeignKeys', connectionId),
    query: (sessionId, sql, params) => invoke('db:query', sessionId, sql, params),
    cancel: (sessionId) => invoke('db:cancel', sessionId)
  },
  connections: {
    list: () => invoke('connections:list'),
    save: (connection) => invoke('connections:save', connection),
    remove: (id) => invoke('connections:remove', id)
  },
  dialog: {
    openSqliteFile: () => invoke('dialog:openSqliteFile'),
    confirm: (message, detail, confirmLabel) =>
      invoke('dialog:confirm', message, detail, confirmLabel),
    showError: (message, detail) => invoke('dialog:showError', message, detail)
  },
  files: {
    openSql: (connectionId) => invoke('files:openSql', connectionId),
    readSql: (connectionId, path) => invoke('files:readSql', connectionId, path),
    saveSql: (sql, path, name, connectionId) =>
      invoke('files:saveSql', sql, path, name, connectionId),
    list: (connectionId) => invoke('files:list', connectionId),
    forget: (connectionId, path) => invoke('files:forget', connectionId, path)
  },
  history: {
    list: (connectionId) => invoke('history:list', connectionId),
    add: (connectionId, entry) => invoke('history:add', connectionId, entry),
    clear: (connectionId) => invoke('history:clear', connectionId)
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (changes) => invoke('settings:set', changes)
  },
  app: {
    confirmSave: (titles, reason) => invoke('app:confirmSave', titles, reason),
    closeWindow: () => invoke('app:closeWindow'),
    cancelClose: () => invoke('app:cancelClose'),
    onCommand: (listener) => listen('app:command', listener),
    onSettingsChanged: (listener) => listen('app:settingsChanged', listener),
    onConnectionChanged: (listener) => listen('app:connectionChanged', listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
