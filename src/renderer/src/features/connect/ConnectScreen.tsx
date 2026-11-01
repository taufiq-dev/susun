import { useEffect, useState } from 'react'
import type { ConnectionConfig, SavedConnection } from '@shared/types'
import { MainArea, SidePanel } from '@renderer/components/SidePanel'
import { Button, DbMark } from '@renderer/components/ui'
import { FRAMELESS } from '@renderer/platform'
import { useSession } from '@renderer/store/session'
import { ConnectionFields } from './ConnectionFields'
import { defaultName, describe, draftFromSaved, emptyDraft, toConfig, type Draft } from './draft'

type Busy = 'test' | 'connect' | 'save' | 'delete'

// What the status line says while an action runs. The buttons keep their labels, so they don't
// change width and move the ones beside them.
const BUSY_TEXT: Record<Busy, string> = {
  connect: 'Connecting…',
  test: 'Testing the connection…',
  save: 'Saving…',
  delete: 'Deleting…'
}

interface Status {
  kind: 'busy' | 'ok' | 'error'
  text: string
}

const STATUS_COLOURS: Record<Status['kind'], string> = {
  busy: 'text-muted',
  ok: 'text-ok',
  error: 'text-danger'
}

export function ConnectScreen(): React.JSX.Element {
  const [saved, setSaved] = useState<SavedConnection[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  // After Edit Connection, or a failed switch, it opens on that connection's form.
  const [draft, setDraft] = useState<Draft>(() => {
    const returnTo = useSession.getState().returnTo
    return returnTo ? draftFromSaved(returnTo.connection) : emptyDraft()
  })
  const [busy, setBusy] = useState<Busy | null>(null)
  const [status, setStatus] = useState<Status | null>(() => {
    const error = useSession.getState().returnTo?.error
    return error ? { kind: 'error', text: error } : null
  })
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [listVersion, setListVersion] = useState(0)
  const openSession = useSession((s) => s.open)

  // The form and status above have taken it.
  useEffect(() => {
    useSession.setState({ returnTo: null })
  }, [])

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
    setStatus({ kind: 'busy', text: BUSY_TEXT[kind] })
    try {
      const outcome = await action()
      setStatus(outcome ?? null)
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

  const connect = async (
    config: ConnectionConfig,
    connectionName: string,
    savedId: string | undefined
  ): Promise<void> => {
    const connectionId = await window.api.db.connect(config, savedId)
    openSession({
      connectionId,
      name: connectionName,
      type: config.type,
      detail: describe(config),
      config,
      savedId
    })
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
        {/* On macOS the name shares the window's top band with the traffic lights (frameless). */}
        <h1
          className={
            FRAMELESS
              ? 'flex h-10 shrink-0 items-center pr-4 pl-20 font-semibold app-drag'
              : 'px-4 pt-4 pb-3 text-[15px] font-semibold'
          }
        >
          Trowel
        </h1>
        <h2 className="px-4 pb-1.5 text-[12px] text-muted frameless:pt-2">Saved connections</h2>
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
                    onDoubleClick={() => void run('connect', () => connect(c.config, c.name, c.id))}
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

      <MainArea className="flex flex-col bg-surface">
        {/* The rest of the top band, which drags the window like a title bar. */}
        {FRAMELESS && <div className="h-10 shrink-0 app-drag" />}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <form
            data-db={draft.type}
            className="flex max-w-[560px] flex-col gap-6 px-10 py-8 frameless:pt-2"
            onSubmit={(e) => {
              e.preventDefault()
              void run('connect', () => connect(configOrThrow(), name, draft.id))
            }}
          >
            <h2 className="truncate text-[15px] font-semibold">
              {draft.id ? draft.name || name : 'New connection'}
            </h2>

            <ConnectionFields
              draft={draft}
              namePlaceholder={name || 'My database'}
              onChange={edit}
            />

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" disabled={busy !== null}>
                  Connect
                </Button>
                <Button onClick={() => void test()} disabled={busy !== null}>
                  Test connection
                </Button>
                <Button onClick={() => void save()} disabled={busy !== null}>
                  Save
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
              <StatusLine status={status} />
            </div>
          </form>
        </div>
      </MainArea>
    </div>
  )
}

// The outcome of the last action, or what is running. An error's first paragraph says what went
// wrong; any after it are detail, such as the driver's own message (see src/main/db/errors.ts).
// It always takes at least a line, so the form doesn't move when it appears.
function StatusLine({ status }: { status: Status | null }): React.JSX.Element {
  const [summary, ...detail] = status?.text.split('\n\n') ?? []
  return (
    <div role="status" className="min-h-[1.4em] text-[12px] break-words select-text">
      {status && <p className={STATUS_COLOURS[status.kind]}>{summary}</p>}
      {detail.length > 0 && (
        <p className="mt-1 font-mono text-[11px] whitespace-pre-wrap text-muted">
          {detail.join('\n\n')}
        </p>
      )}
    </div>
  )
}
