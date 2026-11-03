import { isIP } from 'net'
import type { Connection as CoreConnection } from 'mysql2'
import {
  createConnection,
  type Connection,
  type ConnectionOptions,
  type FieldPacket,
  type ResultSetHeader,
  type RowDataPacket
} from 'mysql2/promise'
import {
  ROW_LIMIT,
  type ColumnInfo,
  type QueryResult,
  type ServerConnectionConfig,
  type TableInfo,
  type TableRef
} from '@shared/types'
import type { DbClient } from './client'
import { CONNECT_TIMEOUT_MS, KEEPALIVE_DELAY_MS, connectError } from './errors'
import { tlsOptions } from './tls'

const LIST_TABLES = `
  select table_name as name, table_type as type
  from information_schema.tables
  where table_schema = database()
  order by table_name`

const LIST_COLUMNS = `
  select column_name as name,
    column_type as data_type,
    is_nullable = 'YES' as nullable,
    column_default as default_value,
    column_key = 'PRI' as primary_key
  from information_schema.columns
  where table_schema = coalesce(?, database()) and table_name = ?
  order by ordinal_position`

// The server's last word before it closes a connection: it was killed (MariaDB's error for it),
// the server is shutting down, or it timed out idle (MySQL 8.0.24 and later).
const CLOSING_ERRORS = new Set([1927, 1053, 4031])

async function connected(config: ServerConnectionConfig): Promise<Connection> {
  const conn = await createConnection(connectionOptions(config)).catch((err) => {
    throw connectError(err, config)
  })
  // A dropped connection emits 'error'; unhandled, it would crash the main process.
  conn.on('error', (err) => console.error('mysql connection error:', err.message))
  return conn
}

function connectionOptions(config: ServerConnectionConfig): ConnectionOptions {
  const tls = tlsOptions(config.ssl)
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database || undefined,
    // mysql2 checks the certificate's host name only when asked to.
    ssl: tls && { ...tls, verifyIdentity: tls.rejectUnauthorized },
    connectTimeout: CONNECT_TIMEOUT_MS,
    enableKeepAlive: true,
    keepAliveInitialDelay: KEEPALIVE_DELAY_MS,
    // BIGINT and DECIMAL values that don't fit a JS number arrive as strings instead of being
    // rounded, so they display correctly and still match in a WHERE clause.
    supportBigNumbers: true,
    // Dates and times arrive as text, as the server formats them, rather than as JS Dates read
    // in this computer's time zone.
    dateStrings: true
  }
}

// Runs a statement reading its rows as they arrive, keeping the first ROW_LIMIT and only counting
// the rest. The server sends every row whatever the client does: stopping it would mean killing
// the statement, which could leave a MariaDB INSERT ... RETURNING half done. Of a CALL's result
// sets, only the first is kept. `running` holds a function that fails the query while it runs:
// mysql2 tells a query with no callback about a closed connection only by an 'error' event on the
// connection, so without it the query would never settle.
function streamQuery(
  conn: Connection,
  sql: string,
  params: unknown[],
  running: Set<(err: Error) => void>
): Promise<Omit<QueryResult, 'durationMs'>> {
  return new Promise((resolve, reject) => {
    let columns: string[] | undefined
    // Set once the first result set with columns has ended.
    let firstDone = false
    const rows: unknown[][] = []
    let total = 0
    let changed = 0
    let failed = false
    const fail = (err: Error): void => {
      failed = true
      running.delete(fail)
      reject(err)
    }
    // Before the query: on a closed connection, the event comes during the call.
    running.add(fail)
    // The promise wrapper's query collects every row; the core connection's emits them one by one.
    const query = core(conn).query({ sql, rowsAsArray: true }, params)
    // Once per result, before its rows; undefined for one without rows.
    query.on('fields', (fields: FieldPacket[] | undefined) => {
      if (columns) firstDone = true
      else if (fields) columns = fields.map((f) => f.name)
    })
    query.on('result', (row: unknown[] | ResultSetHeader) => {
      if (!Array.isArray(row)) changed += row.affectedRows
      else if (!firstDone) {
        total++
        if (rows.length < ROW_LIMIT) rows.push(row)
      }
    })
    query.on('error', fail)
    query.on('end', () => {
      if (failed) return
      running.delete(fail)
      if (!columns) resolve({ columns: [], rows: [], rowCount: changed })
      else resolve({ columns, rows, rowCount: total, truncated: total > ROW_LIMIT })
    })
  })
}

// mysql2's types leave out the promise wrapper's `connection` property.
function core(conn: Connection): CoreConnection {
  return (conn as unknown as { connection: CoreConnection }).connection
}

export class MysqlClient implements DbClient {
  private config: ServerConnectionConfig
  private conn?: Connection
  // A function for each running query that fails it.
  private running = new Set<(err: Error) => void>()
  private lostListener?: (reason: string) => void

  constructor(config: ServerConnectionConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    // For an IP address mysql2 leaves out the TLS server name, so Node checks the certificate
    // against "localhost" instead of that address (mysql2 3.24.6). Refuse rather than check the
    // wrong name.
    if (this.config.ssl === 'verify' && isIP(this.config.host)) {
      throw new Error("MySQL's SSL Verify mode needs the server's host name, not an IP address")
    }
    const conn = await connected(this.config)
    this.conn = conn
    conn.on('error', (err) => {
      if (this.conn === conn) this.lostListener?.(err.message)
      for (const fail of this.running) fail(err)
    })
  }

  // Cancels a running query first: the server doesn't notice a closed connection until it sends
  // something, so it would keep running the query.
  async disconnect(): Promise<void> {
    await this.cancel().catch((err) => console.error('mysql cancel failed:', err.message))
    const conn = this.conn
    // First, so that its ending doesn't count as losing it.
    this.conn = undefined
    await conn?.end()
  }

  onLost(listener: (reason: string) => void): void {
    this.lostListener = listener
  }

  async listTables(): Promise<TableInfo[]> {
    const [rows] = await this.connection().query<RowDataPacket[]>(LIST_TABLES)
    return rows.map((r) => ({ name: r.name, type: r.type === 'BASE TABLE' ? 'table' : 'view' }))
  }

  async listColumns(table: TableRef): Promise<ColumnInfo[]> {
    const [rows] = await this.connection().query<RowDataPacket[]>(LIST_COLUMNS, [
      table.schema ?? null,
      table.name
    ])
    return rows.map((r) => ({
      name: r.name,
      dataType: r.data_type,
      nullable: Boolean(r.nullable),
      defaultValue: r.default_value,
      primaryKey: Boolean(r.primary_key)
    }))
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const conn = this.connection()
    const start = performance.now()
    try {
      const result = await streamQuery(conn, sql, params, this.running)
      return { ...result, durationMs: performance.now() - start }
    } catch (err) {
      const { errno } = err as { errno?: number }
      if (errno && CLOSING_ERRORS.has(errno) && this.conn === conn) {
        this.lostListener?.((err as Error).message)
      }
      throw err
    }
  }

  // Kills the running query from a second short-lived connection; it then rejects with "Query
  // execution was interrupted". The connection and its session stay.
  async cancel(): Promise<void> {
    const conn = this.conn
    if (!conn || this.running.size === 0) return
    const other = await connected(this.config)
    try {
      await other.query(`KILL QUERY ${Number(conn.threadId)}`)
    } finally {
      await other.end()
    }
  }

  private connection(): Connection {
    if (!this.conn) throw new Error('Not connected')
    return this.conn
  }
}
