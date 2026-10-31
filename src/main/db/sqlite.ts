import { utilityProcess, type UtilityProcess } from 'electron'
import type {
  ColumnInfo,
  QueryResult,
  SqliteConnectionConfig,
  TableInfo,
  TableRef
} from '@shared/types'
import type { DbClient } from './client'
import type { SqliteMethods, SqliteRequest, SqliteResponse } from './sqlite.process'
import sqliteProcessPath from './sqlite.process?modulePath'

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

// The cancelled query's error.
const CANCELLED =
  'SQLite can’t stop a query in place, so Trowel reopened the database: an open transaction was ' +
  'rolled back, and temporary tables, attached databases and settings were reset.'

// Each connection gets its own utility process (see sqlite.process.ts), so a slow SQLite query
// blocks neither the main process nor other connections, and killing the process stops it.
export class SqliteClient implements DbClient {
  private config: SqliteConnectionConfig
  private child?: UtilityProcess
  // Settles when `child` has opened the file; calls wait for it.
  private ready: Promise<void> = Promise.resolve()
  private nextId = 0
  private pending = new Map<number, Pending>()

  constructor(config: SqliteConnectionConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    this.ready = this.start()
    try {
      await this.ready
    } catch (err) {
      await this.disconnect()
      throw err
    }
  }

  // Rejects any call still waiting and kills the process, at once even mid-query. SQLite's
  // journal rolls back an interrupted write the next time the file is opened.
  async disconnect(): Promise<void> {
    const child = this.child
    if (!child) return
    this.stop(new Error('Connection closed'))
    child.kill()
  }

  listTables(): Promise<TableInfo[]> {
    return this.call('listTables')
  }

  listColumns(table: TableRef): Promise<ColumnInfo[]> {
    return this.call('listColumns', table)
  }

  query(sql: string, params?: unknown[]): Promise<QueryResult> {
    return this.call('query', sql, params)
  }

  // better-sqlite3 can't interrupt a query, so this kills the process and opens the file again in
  // a new one, which loses the session's state (see CANCELLED).
  async cancel(): Promise<void> {
    const child = this.child
    if (!child || this.pending.size === 0) return
    this.stop(new Error(CANCELLED))
    child.kill()
    this.ready = this.start()
    await this.ready
  }

  // Starts a process for the connection and opens the file in it.
  private async start(): Promise<void> {
    const child = utilityProcess.fork(sqliteProcessPath, [], { serviceName: 'Trowel SQLite' })
    this.child = child
    child.on('message', (res: SqliteResponse) => {
      const pending = this.pending.get(res.id)
      if (!pending) return
      this.pending.delete(res.id)
      if (res.ok) pending.resolve(res.value)
      else pending.reject(new Error(res.message))
    })
    // An uncaught exception in the process also ends it. A process replaced by `cancel` is no
    // longer `this.child` and has nothing to reject.
    child.on('exit', () => {
      if (this.child === child) this.stop(new Error('Connection closed'))
    })
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('exit', () => reject(new Error('The SQLite process failed to start')))
    })
    await this.post(child, 'open', this.config.file)
  }

  private async call<M extends keyof SqliteMethods>(
    method: M,
    ...args: Parameters<SqliteMethods[M]>
  ): Promise<ReturnType<SqliteMethods[M]>> {
    await this.ready
    const child = this.child
    if (!child) throw new Error('Not connected')
    return this.post(child, method, ...args)
  }

  private post<M extends keyof SqliteMethods>(
    child: UtilityProcess,
    method: M,
    ...args: Parameters<SqliteMethods[M]>
  ): Promise<ReturnType<SqliteMethods[M]>> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      const request: SqliteRequest = { id, method, args }
      child.postMessage(request)
    })
  }

  private stop(err: Error): void {
    this.child = undefined
    for (const pending of this.pending.values()) pending.reject(err)
    this.pending.clear()
  }
}
