// The app's windows: main windows (the connect screen, then a connection's workspace) and the
// Settings window. Both load the renderer; the Settings window's URL ends in #settings.
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import {
  app,
  BrowserWindow,
  nativeTheme,
  shell,
  type BrowserWindowConstructorOptions,
  type WebContents
} from 'electron'
import type { AppCommand, AppEvents } from '@shared/api'
import icon from '../../resources/icon.png?asset'

// A window's own background, which shows wherever the page hasn't painted: in the strip a quick
// resize uncovers before the page lays out again at the new size. Electron's default is white, so
// it matches the page's surface colour in the OS theme instead (--surface in main.css).
export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#222328' : '#ffffff'
}

// What every window shares. On macOS a window has no title bar of its own: the page's top band
// takes its place, in the app's colours, with the traffic lights centred in it (the band is 40px;
// see `frameless` in main.css). Elsewhere the system's title bar stays.
function common(): BrowserWindowConstructorOptions {
  return {
    show: false,
    backgroundColor: windowBackground(),
    autoHideMenuBar: true,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 13 } }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  }
}

// Loads the renderer: the dev server's URL in development, the built file otherwise.
function load(window: BrowserWindow, hash?: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

export function sendCommand(contents: WebContents, command: AppCommand): void {
  const channel: keyof AppEvents = 'app:command'
  contents.send(channel, command)
}

// Closing a main window first asks its page, which may have query tabs with unsaved SQL: the close
// is held back and the page is sent 'close-window'. Once the user has dealt with them, the page
// calls `allowClose`, which closes the window for real. If the user cancels, the window stays.
//
// Quitting asks every window to close at once, and a close held back cancels the quit. So quitting
// asks one window at a time, as macOS apps do: the first window to close is asked, and the others
// hold their close without asking. Once that window is let close, quitting starts again (and the
// next window is asked); if its user cancels, the page says so (`cancelClose`) and the quit stops.
const mainWindows = new Set<BrowserWindow>()
const mayClose = new WeakSet<WebContents>()
const quitAfterClose = new WeakSet<WebContents>()
// A quit is under way: from before-quit until the window it asked is let close, or cancels.
let quitting = false
// The window the quit is waiting on.
let askedToQuit: WebContents | null = null

app.on('before-quit', () => {
  quitting = true
  askedToQuit = null
})

// Opens a main window on the connect screen: centred, or, for New Window, offset from the window
// it was opened from, as windows cascade on macOS.
export function createMainWindow(from?: BrowserWindow | null): BrowserWindow {
  const offset = from && !from.isDestroyed() ? from.getBounds() : null
  const window = new BrowserWindow({
    width: offset?.width ?? 1280,
    height: offset?.height ?? 800,
    ...(offset && { x: offset.x + 24, y: offset.y + 24 }),
    minWidth: 960,
    minHeight: 600,
    ...common()
  })
  const contents = window.webContents
  mainWindows.add(window)

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => mainWindows.delete(window))
  window.on('close', (e) => {
    // A page that crashed or is still loading can't answer.
    if (mayClose.has(contents) || contents.isCrashed() || contents.isLoading()) return
    e.preventDefault()
    if (quitting) {
      // Another window is being asked: this one waits its turn.
      if (askedToQuit && askedToQuit !== contents) return
      askedToQuit = contents
      quitAfterClose.add(contents)
    } else quitAfterClose.delete(contents)
    sendCommand(contents, 'close-window')
  })
  contents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  load(window)
  return window
}

export function hasMainWindow(): boolean {
  return mainWindows.size > 0
}

// Whether the window's close was held back by quitting, so closing it carries on quitting.
export function closingToQuit(contents: WebContents): boolean {
  return quitAfterClose.has(contents)
}

// The page has dealt with its unsaved query tabs: closes its window, and carries on quitting if
// that is what was closing it.
export function allowClose(contents: WebContents): void {
  const window = BrowserWindow.fromWebContents(contents)
  if (!window) return
  mayClose.add(contents)
  const quit = quitAfterClose.has(contents)
  if (askedToQuit === contents) askedToQuit = null
  window.close()
  if (quit) app.quit()
}

// The page's user cancelled closing its window: a quit waiting on it stops.
export function cancelClose(contents: WebContents): void {
  quitAfterClose.delete(contents)
  if (askedToQuit === contents) {
    askedToQuit = null
    quitting = false
  }
}

let settingsWindow: BrowserWindow | null = null

// Opens the Settings window, or brings it to the front if it is open.
export function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }
  const window = new BrowserWindow({
    width: 520,
    height: 260,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Settings',
    ...common()
  })
  settingsWindow = window
  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    settingsWindow = null
  })
  load(window, 'settings')
}
