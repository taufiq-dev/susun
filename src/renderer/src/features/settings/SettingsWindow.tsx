import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import { FRAMELESS } from '@renderer/platform'

// The Settings window's page (the window's URL ends in #settings). A change applies at once; there
// is no Save button. It follows changes made elsewhere, such as the save prompt's "Don't ask again".
export function SettingsWindow(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    window.api.settings.get().then(
      (loaded) => current && setSettings(loaded),
      (err: Error) => current && setError(err.message)
    )
    const stop = window.api.app.onSettingsChanged(setSettings)
    // Cmd+W closes this window; it has no tabs.
    const stopCommands = window.api.app.onCommand((command) => {
      if (command === 'close-tab') void window.api.app.closeWindow()
    })
    return () => {
      current = false
      stop()
      stopCommands()
    }
  }, [])

  const change = (changes: Partial<Settings>): void => {
    setError(null)
    window.api.settings.set(changes).catch((err: Error) => setError(err.message))
  }

  return (
    <div className="flex h-full flex-col bg-surface select-none">
      {/* On macOS the title shares the window's top band with the traffic lights. */}
      {FRAMELESS && (
        <h1 className="flex h-10 shrink-0 items-center justify-center font-semibold app-drag">
          Settings
        </h1>
      )}
      <main className="flex flex-col gap-3 px-6 pt-3 pb-6">
        <h2 className="text-[12px] text-muted">Query tabs</h2>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={settings?.askToSaveQueries ?? false}
            disabled={!settings}
            onChange={(e) => change({ askToSaveQueries: e.target.checked })}
            className="mt-0.5 accent-accent"
          />
          <span>
            Ask to save a query tab’s SQL before closing it
            <span className="mt-0.5 block text-[12px] text-muted">
              Also when disconnecting, closing the window or quitting. When this is off, SQL that
              isn’t saved to a file is discarded without asking.
            </span>
          </span>
        </label>
        {error && <p className="text-[12px] text-danger select-text">{error}</p>}
      </main>
    </div>
  )
}
