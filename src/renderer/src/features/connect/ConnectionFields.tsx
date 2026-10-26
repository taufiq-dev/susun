import { DB_TYPES, SSL_MODES, type SslMode } from '@shared/types'
import { Button, DbMark, Field, Segmented, TextInput } from '@renderer/components/ui'
import { DB_LABELS, withType, type Draft } from './draft'

const SSL_LABELS: Record<SslMode, string> = { off: 'Off', require: 'Require', verify: 'Verify' }

const SSL_HINTS: Record<SslMode, string> = {
  off: 'Not encrypted. Fine for a database on this computer or a private network.',
  require:
    'Encrypted, but the server’s certificate isn’t checked, so it doesn’t protect against a man in the middle.',
  verify:
    'Encrypted, and the server’s certificate and host name are checked against the certificate authorities this computer trusts.'
}

export function ConnectionFields({
  draft,
  namePlaceholder,
  onChange
}: {
  draft: Draft
  namePlaceholder: string
  onChange: (draft: Draft) => void
}): React.JSX.Element {
  const set =
    (key: keyof Draft) =>
    (e: React.ChangeEvent<HTMLInputElement>): void =>
      onChange({ ...draft, [key]: e.target.value })

  const chooseFile = async (): Promise<void> => {
    const file = await window.api.dialog.openSqliteFile()
    if (file) onChange({ ...draft, file })
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Name">
        <TextInput value={draft.name} placeholder={namePlaceholder} onChange={set('name')} />
      </Field>

      <Segmented
        legend="Type"
        name="type"
        value={draft.type}
        options={DB_TYPES.map((type) => ({
          value: type,
          label: (
            <>
              <DbMark type={type} />
              {DB_LABELS[type]}
            </>
          )
        }))}
        onChange={(type) => onChange(withType(draft, type))}
      />

      {draft.type === 'sqlite' ? (
        <Field label="File">
          <div className="flex gap-2">
            <TextInput
              value={draft.file}
              placeholder="/path/to/database.db"
              onChange={set('file')}
              className="font-mono text-[12px]"
            />
            <Button onClick={() => void chooseFile()}>Choose…</Button>
          </div>
        </Field>
      ) : (
        <>
          <div className="flex gap-3">
            <Field label="Host" className="flex-1">
              <TextInput value={draft.host} onChange={set('host')} />
            </Field>
            <Field label="Port" className="w-24">
              <TextInput value={draft.port} inputMode="numeric" onChange={set('port')} />
            </Field>
          </div>
          <div className="flex gap-3">
            <Field label="User" className="flex-1">
              <TextInput value={draft.user} onChange={set('user')} />
            </Field>
            <Field label="Password" className="flex-1">
              <TextInput
                type="password"
                autoComplete="off"
                value={draft.password}
                onChange={set('password')}
              />
            </Field>
          </div>
          <Field label="Database">
            <TextInput
              value={draft.database}
              placeholder={draft.type === 'postgres' ? 'Same as the user name' : 'None'}
              onChange={set('database')}
            />
          </Field>
          <div>
            <Segmented
              legend="SSL"
              name="ssl"
              value={draft.ssl}
              options={SSL_MODES.map((mode) => ({ value: mode, label: SSL_LABELS[mode] }))}
              onChange={(ssl) => onChange({ ...draft, ssl })}
            />
            <p className="mt-1.5 max-w-[46ch] text-[12px] text-muted">{SSL_HINTS[draft.ssl]}</p>
          </div>
        </>
      )}
    </div>
  )
}
