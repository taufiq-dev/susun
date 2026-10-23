import type { Worker } from 'worker_threads'
import type {
  ColumnInfo,
  QueryResult,
  SqliteConnectionConfig,
  TableInfo,
  TableRef
} from '@shared/types'
import type { DbClient } from './client'
import type { SqliteMethods, SqliteRequest, SqliteResponse } from './sqlite.worker'
import createWorker from './sqlite.worker?nodeWorker'

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

// Each connection gets its own worker thread (see sqlite.worker.ts), so a slow SQLite query
// blocks neither the main process nor other connections.
export class SqliteClient implements DbClient {
  private config: SqliteConnectionConfig
  private worker?: Worker
  private nextId = 0
  private pending = new Map<number, Pending>()

  constructor(config: SqliteConnectionConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    const worker = createWorker({})
    this.worker = worker
    worker.on('message', (res: SqliteResponse) => {
      const pending = this.pending.get(res.id)
      if (!pending) return
      this.pending.delete(res.id)
      if (res.ok) pending.resolve(res.value)
      else pending.reject(new Error(res.message))
    })
    // 'error' is an uncaught exception in the worker, which then exits.
    worker.on('error', (err) => this.stop(err))
    worker.on('exit', () => this.stop(new Error('Connection closed')))
    try {
      await this.call('open', this.config.file)
    } catch (err) {
      await this.disconnect()
      throw err
    }
  }

  // Rejects any call still waiting and terminates the worker, which closes the database
  // (better-sqlite3 closes its handles when the thread shuts down). terminate() can't interrupt a
  // query already running inside SQLite, so the thread only exits once that query ends; don't
  // wait for it.
  async disconnect(): Promise<void> {
    const worker = this.worker
    if (!worker) return
    this.stop(new Error('Connection closed'))
    void worker.terminate()
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

  private call<M extends keyof SqliteMethods>(
    method: M,
    ...args: Parameters<SqliteMethods[M]>
  ): Promise<ReturnType<SqliteMethods[M]>> {
    const worker = this.worker
    if (!worker) return Promise.reject(new Error('Not connected'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      const request: SqliteRequest = { id, method, args }
      worker.postMessage(request)
    })
  }

  private stop(err: Error): void {
    this.worker = undefined
    for (const pending of this.pending.values()) pending.reject(err)
    this.pending.clear()
  }
}
