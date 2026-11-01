// The app menu. Most File items are commands for the focused window's page (`AppCommand`), which
// knows its tabs; Close Window closes the window, which asks the page first (windows.ts).
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { AppCommand } from '@shared/api'
import { createMainWindow, openSettingsWindow, sendCommand } from './windows'

const IS_MAC = process.platform === 'darwin'

// An item that sends its command to the focused window's page.
function command(label: string, name: AppCommand, accelerator: string): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: () => {
      const window = BrowserWindow.getFocusedWindow()
      if (window) sendCommand(window.webContents, name)
    }
  }
}

export function setAppMenu(): void {
  const separator: MenuItemConstructorOptions = { type: 'separator' }
  const settings: MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    click: () => openSettingsWindow()
  }
  const template: MenuItemConstructorOptions[] = [
    ...(IS_MAC
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              separator,
              settings,
              separator,
              { role: 'services' },
              separator,
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              separator,
              { role: 'quit' }
            ] satisfies MenuItemConstructorOptions[]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          // Another connect screen, for another connection (each window has its own).
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => createMainWindow(BrowserWindow.getFocusedWindow())
        },
        command('New Query', 'new-query', 'CmdOrCtrl+T'),
        command('Open…', 'open', 'CmdOrCtrl+O'),
        separator,
        command('Save', 'save', 'CmdOrCtrl+S'),
        command('Save As…', 'save-as', 'CmdOrCtrl+Shift+S'),
        separator,
        // In the Settings window, the page closes the window.
        command('Close Tab', 'close-tab', 'CmdOrCtrl+W'),
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => BrowserWindow.getFocusedWindow()?.close()
        },
        ...(IS_MAC ? [] : [separator, settings, separator, { role: 'quit' } as const])
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        // Reloading loses the window's tabs, so only while developing.
        ...(is.dev
          ? [{ role: 'reload' } as const, { role: 'toggleDevTools' } as const, separator]
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        separator,
        { role: 'togglefullscreen' }
      ]
    },
    // Not the windowMenu role: off macOS it has a Close item on Ctrl+W, which is Close Tab here.
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(IS_MAC ? [separator, { role: 'front' } as const] : [])
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
