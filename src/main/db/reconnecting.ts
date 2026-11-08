import type { ColumnInfo, ForeignKeyInfo, QueryResult, TableInfo, TableRef } from '@shared/types'
import type { DbClient } from './client'
import { FIRST_WORD } from './limit'

// Statements that leave nothing behind on their session once they have finished.
const STATELESS = new Set([
  'select',
  'with',
  'values',
  'table',
  'show',
  'explain',
  'describe',
  'desc',
  'insert',
  'update',
  'delete',
  'replace',
  'merge',
  'truncate',
  'drop'
])
// How a SELECT can leave something behind: a setting or variable, a lock, a temporary table.
const SELECT_KEEPS_STATE = /\b(?:set_config|pg_advisory\w*|get_lock|into)\b|:=/i
// A MySQL executable comment, which runs whatever is in it.
const EXECUTABLE_COMMENT = /\/\*M?!/

// Whether a statement could leave something on its session that a new connection wouldn't have: an
// open transaction, a setting, a temporary table, a lock. Anything unrecognized could, since a
// wrong "yes" only costs a message, and a wrong "no" could run the next statement somewhere other
// than where the user expects. A function called by a SELECT isn't looked into, beyond the usual
// ones above.
export function mayKeepState(sql: string): boolean {
  const first = FIRST_WORD.exec(sql)?.[1].toLowerCase()
  if (!first || !STATELESS.has(first) || EXECUTABLE_COMMENT.test(sql)) return true
  return (first === 'select' || first === 'with') && SELECT_KEEPS_STATE.test(sql)
}

const STATE_GONE =
  'Any open transaction was rolled back, and temporary tables and session settings are gone.'

// The first line of each is what the query history shows.
function lostWhileRunning(reason: string, heldState: boolean): string {
  const gone = heldState ? `${STATE_GONE} ` : ''
  return (
    'The connection to the database was lost, so this may not have finished.\n\n' +
    `${gone}Try again to reconnect.\n\n${reason}`
  )
}

function heldBack(reason: string, inMemory: boolean): string {
  return inMemory
    ? 'The connection to the database was lost, so this wasn’t run.\n\n' +
        'This database was in memory, so everything in it is gone. Try again to start a new, ' +
        `empty one.\n\n${reason}`
    : 'The connection to the database was lost, so this wasn’t run.\n\n' +
        `${STATE_GONE} Run it again to carry on without them.\n\n${reason}`
}

export interface ReconnectingOptions {
  // An in-memory database is gone with its connection, so it always counts as holding state.
  inMemory?: boolean
  // Called when the connection is lost (true) and when a new one replaces it (false).
  onChange?: (lost: boolean) => void
}

// A session: a client that replaces its connection after losing it, so that a server restart, a
// network drop or a database scaling to zero doesn't break the session for good. It reconnects when
// next used, not as soon as it notices, since connecting would wake a database that had scaled to
// zero, and go on waking it.
//
// A statement is never sent again: one running when the connection went fails, as nobody can say
// whether it finished. And a new connection isn't the old session, so if the old one may have held
// state, the next statement is held back with an error saying so, once. Otherwise the second half
// of a transaction would commit on its own, or a statement would run under different settings.
export class ReconnectingClient implements Omit<DbClient, 'onLost'> {
  private create: () => DbClient
  private inMemory: boolean
  private onChange?: (lost: boolean) => void
  private client: DbClient
  // Why the connection was lost; undefined while it is up.
  private lostReason?: string
  private reconnecting?: Promise<void>
  private holdsState: boolean
  // The connection was lost holding state, and the user hasn't been told.
  private mustTell = false
  private closed = false
  private cancelled = false

  constructor(create: () => DbClient, options: ReconnectingOptions = {}) {
    this.create = create
    this.inMemory = options.inMemory ?? false
    this.onChange = options.onChange
    this.holdsState = this.inMemory
    this.client = this.watched(create())
  }

  connect(): Promise<void> {
    return this.client.connect()
  }

  async disconnect(): Promise<void> {
    this.closed = true
    await this.client.disconnect()
  }

  async listTables(): Promise<TableInfo[]> {
    return (await this.live()).listTables()
  }

  async listColumns(table: TableRef): Promise<ColumnInfo[]> {
    return (await this.live()).listColumns(table)
  }

  async listColumnsOf(tables: TableRef[]): Promise<ColumnInfo[][]> {
    return (await this.live()).listColumnsOf(tables)
  }

  async listForeignKeys(): Promise<ForeignKeyInfo[]> {
    return (await this.live()).listForeignKeys()
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    const client = await this.live()
    if (mayKeepState(sql)) this.holdsState = true
    const heldState = this.holdsState
    try {
      return await client.query(sql, params)
    } catch (err) {
      // Replaced means lost, by a call that went on to reconnect.
      const replaced = this.client !== client
      if (this.closed || (!replaced && this.lostReason === undefined)) throw err
      if (!replaced) this.mustTell = false
      throw new Error(lostWhileRunning((err as Error).message, heldState), { cause: err })
    }
  }

  // While reconnecting there is no query to stop, so this stops the reconnecting instead.
  async cancel(): Promise<void> {
    if (this.reconnecting) this.cancelled = true
    else if (this.lostReason === undefined) await this.client.cancel()
  }

  // Replaces the connection if it has been lost. Rejects, and stays lost, if connecting fails.
  reconnect(): Promise<void> {
    if (this.lostReason === undefined) return Promise.resolve()
    this.reconnecting ??= this.replace().finally(() => {
      this.reconnecting = undefined
    })
    return this.reconnecting
  }

  // The client to run a call on.
  private async live(): Promise<DbClient> {
    if (this.lostReason !== undefined) {
      if (this.mustTell) {
        this.mustTell = false
        throw new Error(heldBack(this.lostReason, this.inMemory))
      }
      await this.reconnect()
    }
    return this.client
  }

  private async replace(): Promise<void> {
    this.cancelled = false
    const client = this.watched(this.create())
    await client.connect()
    if (this.closed || this.cancelled) {
      await client.disconnect()
      throw new Error(this.closed ? 'Connection closed' : 'Cancelled while reconnecting')
    }
    const old = this.client
    this.client = client
    this.lostReason = undefined
    this.mustTell = false
    this.holdsState = this.inMemory
    this.onChange?.(false)
    old.disconnect().catch((err: Error) => {
      console.error('closing a lost connection failed:', err.message)
    })
  }

  private watched(client: DbClient): DbClient {
    client.onLost((reason) => {
      if (client !== this.client || this.closed || this.lostReason !== undefined) return
      this.lostReason = reason
      this.mustTell = this.holdsState
      this.onChange?.(true)
    })
    return client
  }
}
