import { ipcMain } from 'electron'

export function registerIpc(): void {
  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
}
