import { isIP } from 'net'
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise'
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

export class MysqlClient implements DbClient {
  private config: ServerConnectionConfig
  private conn?: Connection

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
    const tls = tlsOptions(this.config.ssl)
    this.conn = await createConnection({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database || undefined,
      // mysql2 checks the certificate's host name only when asked to.
      ssl: tls && { ...tls, verifyIdentity: tls.rejectUnauthorized },
      connectTimeout: 10_000,
      // BIGINT and DECIMAL values that don't fit a JS number arrive as strings instead of being
      // rounded, so they display correctly and still match in a WHERE clause.
      supportBigNumbers: true,
      // Dates and times arrive as text, as the server formats them, rather than as JS Dates read
      // in this computer's time zone.
      dateStrings: true
    }).catch((err) => {
      throw withoutNodeHint(err)
    })
    // A dropped connection emits 'error'; unhandled, it would crash the main process. Later
    // queries reject with their own error.
    this.conn.on('error', (err) => console.error('mysql connection error:', err.message))
  }

  async disconnect(): Promise<void> {
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
    const start = performance.now()
    const [result, fields] = await this.connection().query({ sql, rowsAsArray: true }, params)
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

  private connection(): Connection {
    if (!this.conn) throw new Error('Not connected')
    return this.conn
  }
}
