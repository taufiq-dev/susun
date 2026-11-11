import { app, nativeTheme, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { setAppMenu } from './menu'
import icon from '../../resources/icon.png?asset'
import { createMainWindow, hasMainWindow, windowBackground } from './windows'

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('tech.susun.app')

  // In development the app runs as Electron's own app bundle, whose icon the Dock would show (and
  // whose name the menu bar does: that only changes in a packaged build).
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(icon)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpc()
  setAppMenu()

  // The page follows the OS theme by itself; the windows' backgrounds follow it here.
  nativeTheme.on('updated', () => {
    for (const window of BrowserWindow.getAllWindows())
      window.setBackgroundColor(windowBackground())
  })

  createMainWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open (the Settings window aside).
    if (!hasMainWindow()) createMainWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
