// The app's settings, one row per key in susun.db's settings table (store.ts), with
// DEFAULT_SETTINGS for any not stored. A change is sent to every window.
import { BrowserWindow } from 'electron'
import type { AppEvents } from '@shared/api'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { store } from './store'

type Key = keyof Settings

function isKey(key: string): key is Key {
  return Object.hasOwn(DEFAULT_SETTINGS, key)
}

export function getSettings(): Settings {
  const settings = { ...DEFAULT_SETTINGS }
  const rows = store().prepare('select key, value from settings').all() as {
    key: string
    value: string
  }[]
  for (const { key, value } of rows) {
    if (!isKey(key)) continue
    const parsed: unknown = JSON.parse(value)
    // A value of the wrong type (from an older version, say) is left at its default.
    if (typeof parsed === typeof DEFAULT_SETTINGS[key]) Object.assign(settings, { [key]: parsed })
  }
  return settings
}

// Stores the changes, ignoring keys that aren't settings, and checking each value's type.
export function setSettings(changes: Partial<Settings>): Settings {
  const upsert = store().prepare(
    'insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value'
  )
  for (const [key, value] of Object.entries(changes)) {
    if (!isKey(key)) continue
    if (typeof value !== typeof DEFAULT_SETTINGS[key]) {
      throw new Error(`Setting ${key} must be a ${typeof DEFAULT_SETTINGS[key]}`)
    }
    upsert.run(key, JSON.stringify(value))
  }
  const settings = getSettings()
  const channel: keyof AppEvents = 'app:settingsChanged'
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, settings)
  return settings
}
