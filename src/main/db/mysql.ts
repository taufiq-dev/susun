import { isIP } from 'net'
import {
  createConnection,
  type Connection,
  type ConnectionOptions,
  type RowDataPacket
} from 'mysql2/promise'
import type {
  ColumnInfo,
  QueryResult,
  ServerConnectionConfig,
  TableInfo,
  TableRef
} from '@shared/types'
import type { DbClient } from './client'
import { tlsOptions, withoutNodeHint } from './tls'

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

async function connected(config: ServerConnectionConfig): Promise<Connection> {
  const conn = await createConnection(connectionOptions(config)).catch((err) => {
    throw withoutNodeHint(err)
  })
  // A dropped connection emits 'error'; unhandled, it would crash the main process. Later
  // queries reject with their own error.
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
    connectTimeout: 10_000,
    // BIGINT and DECIMAL values that don't fit a JS number arrive as strings instead of being
    // rounded, so they display correctly and still match in a WHERE clause.
    supportBigNumbers: true,
    // Dates and times arrive as text, as the server formats them, rather than as JS Dates read
    // in this computer's time zone.
    dateStrings: true
  }
}

export class MysqlClient implements DbClient {
  private config: ServerConnectionConfig
  private conn?: Connection
  private running = 0

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
    this.conn = await connected(this.config)
  }

  // Cancels a running query first: the server doesn't notice a closed connection until it sends
  // something, so it would keep running the query.
  async disconnect(): Promise<void> {
    await this.cancel().catch((err) => console.error('mysql cancel failed:', err.message))
    await this.conn?.end()
    this.conn = undefined
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
    this.running++
    const [result, fields] = await conn
      .query({ sql, rowsAsArray: true }, params)
      .finally(() => this.running--)
    const durationMs = performance.now() - start
    // A statement that returns rows gives an array; anything else gives a ResultSetHeader.
    if (Array.isArray(result)) {
      const rows = result as unknown[][]
      return { columns: fields.map((f) => f.name), rows, rowCount: rows.length, durationMs }
    }
    return {
      columns: [],
      rows: [],
      rowCount: 'affectedRows' in result ? result.affectedRows : 0,
      durationMs
    }
  }

  // Kills the running query from a second short-lived connection; it then rejects with "Query
  // execution was interrupted". The connection and its session stay.
  async cancel(): Promise<void> {
    const conn = this.conn
    if (!conn || this.running === 0) return
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
