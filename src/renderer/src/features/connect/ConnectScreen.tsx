import { useEffect, useState } from 'react'
import type { ConnectionConfig, SavedConnection } from '@shared/types'
import { MainArea, SidePanel } from '@renderer/components/SidePanel'
import { Button, DbMark } from '@renderer/components/ui'
import { useSession } from '@renderer/store/session'
import { ConnectionFields } from './ConnectionFields'
import { defaultName, describe, draftFromSaved, emptyDraft, toConfig, type Draft } from './draft'

type Busy = 'test' | 'connect' | 'save' | 'delete'

interface Status {
  kind: 'ok' | 'error'
  text: string
}

export function ConnectScreen(): React.JSX.Element {
  const [saved, setSaved] = useState<SavedConnection[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState<Busy | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [listVersion, setListVersion] = useState(0)
  const openSession = useSession((s) => s.open)

  // Loads the saved list, and loads it again whenever a save or delete bumps listVersion.
  useEffect(() => {
    let current = true
    window.api.connections.list().then(
      (list) => {
        if (!current) return
        setSaved(list)
        setListError(null)
      },
      (err: Error) => current && setListError(err.message)
    )
    return () => {
      current = false
    }
  }, [listVersion])

  const reloadList = (): void => setListVersion((n) => n + 1)

  const parsed = toConfig(draft)
  const name = draft.name.trim() || ('config' in parsed ? defaultName(parsed.config) : '')

  const edit = (next: Draft): void => {
    setDraft(next)
    setStatus(null)
    setConfirmingDelete(false)
  }

  // Runs one form action, showing its outcome (or its error) under the buttons.
  const run = async (kind: Busy, action: () => Promise<Status | void>): Promise<void> => {
    setBusy(kind)
    setStatus(null)
    try {
      const outcome = await action()
      if (outcome) setStatus(outcome)
    } catch (err) {
      setStatus({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const configOrThrow = (): ConnectionConfig => {
    if ('error' in parsed) throw new Error(parsed.error)
    return parsed.config
  }

  const connect = async (config: ConnectionConfig, connectionName: string): Promise<void> => {
    const connectionId = await window.api.db.connect(config)
    openSession({ connectionId, name: connectionName, type: config.type, detail: describe(config) })
  }

  const test = (): Promise<void> =>
    run('test', async () => {
      const id = await window.api.db.connect(configOrThrow())
      await window.api.db.disconnect(id)
      return { kind: 'ok', text: 'Connection succeeded.' }
    })

  const save = (): Promise<void> =>
    run('save', async () => {
      const result = await window.api.connections.save({
        id: draft.id,
        name,
        config: configOrThrow()
      })
      setDraft((d) => ({ ...d, id: result.id, name: result.name }))
      reloadList()
      return { kind: 'ok', text: `Saved “${result.name}”.` }
    })

  // The first click asks for confirmation, the second deletes.
  const remove = (): void => {
    const id = draft.id
    if (!id) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    void run('delete', async () => {
      await window.api.connections.remove(id)
      setDraft(emptyDraft())
      setConfirmingDelete(false)
      reloadList()
      return { kind: 'ok', text: `Deleted “${name}”.` }
    })
  }

  return (
    <div className="flex h-full">
      <SidePanel id="connections" side="left" resizeLabel="Resize the saved connections list">
        <h1 className="px-4 pt-4 pb-3 text-[15px] font-semibold">Trowel</h1>
        <h2 className="px-4 pb-1.5 text-[12px] text-muted">Saved connections</h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {listError && <p className="px-4 text-[12px] text-danger">{listError}</p>}
          {saved?.length === 0 && (
            <p className="px-4 text-[12px] text-muted">
              None yet. Fill in the form and choose Save to keep a connection here.
            </p>
          )}
          <ul>
            {saved?.map((c) => {
              const selected = c.id === draft.id
              const detail = describe(c.config)
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    data-db={c.config.type}
                    aria-current={selected || undefined}
                    title="Double-click to connect"
                    onClick={() => edit(draftFromSaved(c))}
                    onDoubleClick={() => void run('connect', () => connect(c.config, c.name))}
                    className={`focus-ring flex w-full items-start gap-2.5 px-4 py-1.5 text-left ${
                      selected
                        ? 'bg-surface shadow-[inset_2px_0_0_var(--accent)]'
                        : 'hover:bg-surface/60'
                    }`}
                  >
                    <DbMark type={c.config.type} className="mt-1.5" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      {detail !== c.name && (
                        <span className="block truncate text-[12px] text-muted">{detail}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="border-t border-line p-3">
          <Button className="w-full" onClick={() => edit(emptyDraft())}>
            New connection
          </Button>
        </div>
      </SidePanel>

      <MainArea className="overflow-y-auto bg-surface">
        <form
          data-db={draft.type}
          className="flex max-w-[560px] flex-col gap-6 px-10 py-8"
          onSubmit={(e) => {
            e.preventDefault()
            void run('connect', () => connect(configOrThrow(), name))
          }}
        >
          <h2 className="truncate text-[15px] font-semibold">
            {draft.id ? draft.name || name : 'New connection'}
          </h2>

          <ConnectionFields draft={draft} namePlaceholder={name || 'My database'} onChange={edit} />

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" disabled={busy !== null}>
                {busy === 'connect' ? 'Connecting…' : 'Connect'}
              </Button>
              <Button onClick={() => void test()} disabled={busy !== null}>
                {busy === 'test' ? 'Testing…' : 'Test connection'}
              </Button>
              <Button onClick={() => void save()} disabled={busy !== null}>
                {busy === 'save' ? 'Saving…' : 'Save'}
              </Button>
              {draft.id && (
                <Button
                  variant="danger"
                  className="ml-auto"
                  onClick={remove}
                  disabled={busy !== null}
                >
                  {confirmingDelete ? 'Click again to delete' : 'Delete'}
                </Button>
              )}
            </div>
            <p
              role="status"
              className={`min-h-[1.4em] text-[12px] break-words select-text ${
                status?.kind === 'error' ? 'text-danger' : 'text-ok'
              }`}
            >
              {status?.text}
            </p>
          </div>
        </form>
      </MainArea>
    </div>
  )
}
