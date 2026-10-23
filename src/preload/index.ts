import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Api, IpcResult } from '@shared/api'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result: IpcResult<T> = await ipcRenderer.invoke(channel, ...args)
  if (!result.ok) throw new Error(result.message)
  return result.value
}

// Custom APIs for renderer
const api: Api = {
  db: {
    connect: (config) => invoke('db:connect', config),
    disconnect: (connectionId) => invoke('db:disconnect', connectionId),
    listTables: (connectionId) => invoke('db:listTables', connectionId),
    listColumns: (connectionId, table) => invoke('db:listColumns', connectionId, table),
    query: (connectionId, sql, params) => invoke('db:query', connectionId, sql, params)
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
