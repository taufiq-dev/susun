// Saved connections, kept in trowel.db in the app's userData folder. Passwords are encrypted with
// safeStorage (the macOS Keychain, Windows DPAPI or the Linux secret store) and decrypted again
// for the renderer, so they are protected only at rest. The async safeStorage calls don't block
// the main process if the OS shows a keychain prompt.
import { randomUUID } from 'crypto'
import { join } from 'path'
import Database from 'better-sqlite3'
import { app, safeStorage } from 'electron'
import type { ConnectionConfig, SavedConnection, SavedConnectionInput } from '@shared/types'

// One entry per schema version, applied in order and tracked in `pragma user_version`.
const MIGRATIONS = [
  `create table connections (
    id text primary key,
    name text not null,
    config text not null, -- ConnectionConfig as JSON, without the password
    password blob -- encrypted with safeStorage; null when there is none
  )`
]

interface Row {
  id: string
  name: string
  config: string
  password: Buffer | null
}

let db: Database.Database | undefined

function store(): Database.Database {
  if (db) return db
  const opened = new Database(join(app.getPath('userData'), 'trowel.db'))
  const version = opened.pragma('user_version', { simple: true }) as number
  for (let v = version; v < MIGRATIONS.length; v++) {
    opened.transaction(() => {
      opened.exec(MIGRATIONS[v])
      opened.pragma(`user_version = ${v + 1}`)
    })()
  }
  db = opened
  return db
}

export async function listConnections(): Promise<SavedConnection[]> {
  const rows = store()
    .prepare('select id, name, config, password from connections order by name collate nocase, id')
    .all() as Row[]
  return Promise.all(rows.map(toSaved))
}

export async function saveConnection(input: SavedConnectionInput): Promise<SavedConnection> {
  const name = input.name.trim()
  if (!name) throw new Error('Name is required')
  const { rest, password } = splitPassword(input.config)
  const values = [name, JSON.stringify(rest), password ? await encrypt(password) : null]
  const id = input.id ?? randomUUID()
  if (input.id) {
    const { changes } = store()
      .prepare('update connections set name = ?, config = ?, password = ? where id = ?')
      .run(...values, id)
    if (changes === 0) throw new Error('Saved connection not found')
  } else {
    store()
      .prepare('insert into connections (id, name, config, password) values (?, ?, ?, ?)')
      .run(id, ...values)
  }
  return { id, name, config: input.config }
}

export async function removeConnection(id: string): Promise<void> {
  store().prepare('delete from connections where id = ?').run(id)
}

async function toSaved(row: Row): Promise<SavedConnection> {
  const config = JSON.parse(row.config) as ConnectionConfig
  if (config.type !== 'sqlite') config.password = await decrypt(row)
  return { id: row.id, name: row.name, config }
}

// The password lives in its own column, encrypted, so it never appears in the config JSON.
function splitPassword(config: ConnectionConfig): { rest: object; password: string } {
  if (config.type === 'sqlite') return { rest: config, password: '' }
  const { password, ...rest } = config
  return { rest, password }
}

async function encrypt(password: string): Promise<Buffer> {
  // Without a secret store (e.g. Linux with no keyring), safeStorage would fall back to a
  // hardcoded key, which is no better than plain text.
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error("Passwords can't be saved: no system keychain is available")
  }
  return safeStorage.encryptStringAsync(password)
}

// A password that can't be decrypted (the keychain entry was reset, or the file came from another
// machine or user) comes back empty, so the connection still lists and the user can retype it.
async function decrypt(row: Row): Promise<string> {
  if (!row.password) return ''
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(row.password)
    if (shouldReEncrypt) {
      // The key was rotated. Skip the update if the password was changed in the meantime.
      store()
        .prepare('update connections set password = ? where id = ? and password = ?')
        .run(await safeStorage.encryptStringAsync(result), row.id, row.password)
    }
    return result
  } catch (err) {
    console.warn(`Can't decrypt the saved password of "${row.name}":`, (err as Error).message)
    return ''
  }
}
