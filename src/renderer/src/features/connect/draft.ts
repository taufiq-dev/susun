import type { ConnectionConfig, DbType, SavedConnection, SslMode } from '@shared/types'

export const DB_LABELS: Record<DbType, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite'
}

const DEFAULT_PORTS = { postgres: '5432', mysql: '3306' }

// The connection form's state. Server and SQLite fields sit side by side so switching the type
// back and forth keeps what was typed. `id` is set when editing a saved connection.
export interface Draft {
  id?: string
  name: string
  type: DbType
  host: string
  port: string
  user: string
  password: string
  database: string
  ssl: SslMode
  file: string
}

export function emptyDraft(): Draft {
  return {
    name: '',
    type: 'postgres',
    host: 'localhost',
    port: DEFAULT_PORTS.postgres,
    user: '',
    password: '',
    database: '',
    ssl: 'off',
    file: ''
  }
}

export function draftFromSaved({ id, name, config }: SavedConnection): Draft {
  if (config.type === 'sqlite')
    return { ...emptyDraft(), id, name, type: 'sqlite', file: config.file }
  // Connections saved before SSL modes existed have no `ssl`.
  return {
    ...emptyDraft(),
    ...config,
    id,
    name,
    port: String(config.port),
    ssl: config.ssl ?? 'off'
  }
}

// Switching between Postgres and MySQL also switches a default port to the other default.
export function withType(draft: Draft, type: DbType): Draft {
  const next = { ...draft, type }
  if (type !== 'sqlite' && Object.values(DEFAULT_PORTS).includes(draft.port)) {
    next.port = DEFAULT_PORTS[type]
  }
  return next
}

// The config the form describes, or what to fix first.
export function toConfig(draft: Draft): { config: ConnectionConfig } | { error: string } {
  if (draft.type === 'sqlite') {
    const file = draft.file.trim()
    if (!file) return { error: 'Choose a SQLite database file.' }
    return { config: { type: 'sqlite', file } }
  }
  const host = draft.host.trim()
  if (!host) return { error: 'Enter the server’s host name or IP address.' }
  const port = Number(draft.port.trim())
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: 'Port must be a whole number from 1 to 65535.' }
  }
  const { type, user, password, database, ssl } = draft
  return {
    config: { type, host, port, user: user.trim(), password, database: database.trim(), ssl }
  }
}

// One line saying where a connection goes: "shop on db.example.com:5432", or the file name.
export function describe(config: ConnectionConfig): string {
  if (config.type === 'sqlite') return fileName(config.file)
  const server = `${config.host}:${config.port}`
  return config.database ? `${config.database} on ${server}` : server
}

// The name used when the user leaves the name field empty.
export function defaultName(config: ConnectionConfig): string {
  if (config.type === 'sqlite') return fileName(config.file)
  return config.database || config.host
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}
