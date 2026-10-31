import { Client, types, type ClientConfig, type CustomTypesConfig, type QueryArrayResult } from 'pg'
import type {
  ColumnInfo,
  QueryResult,
  ServerConnectionConfig,
  TableInfo,
  TableRef
} from '@shared/types'
import type { DbClient } from './client'
import { tlsOptions, withoutNodeHint } from './tls'

// relkind: r table, p partitioned table, f foreign table, v view, m materialized view.
// Partitions are left out, since they can number in the thousands.
const LIST_TABLES = `
  select n.nspname as schema, c.relname as name, c.relkind as kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'f', 'v', 'm')
    and not c.relispartition
    and n.nspname not in ('pg_catalog', 'information_schema')
    and n.nspname not like 'pg\\_toast%'
    and n.nspname not like 'pg\\_temp\\_%'
  order by n.nspname, c.relname`

const LIST_COLUMNS = `
  select a.attname as name,
    format_type(a.atttypid, a.atttypmod) as data_type,
    not a.attnotnull as nullable,
    pg_get_expr(d.adbin, d.adrelid) as default_value,
    i.indrelid is not null as primary_key
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  left join pg_index i on i.indrelid = a.attrelid and i.indisprimary and a.attnum = any(i.indkey)
  where n.nspname = coalesce($1, current_schema()) and c.relname = $2
    and a.attnum > 0 and not a.attisdropped
  order by a.attnum`

// Dates and times arrive as text, as the server formats them. As JS Dates they would lose
// microseconds, and a `timestamp` (without time zone) would be read in this computer's time zone.
// Intervals and geometric types stay text too, instead of becoming objects. The OIDs are date,
// timestamp, timestamptz, interval, point and circle, then the arrays of the first five.
const AS_TEXT = new Set([1082, 1114, 1184, 1186, 600, 718])
const AS_TEXT_ARRAY = new Set([1182, 1115, 1185, 1187, 1017])
type TypeId = Parameters<typeof types.getTypeParser>[0]
// pg-types' TypeId enum lists only element types, not arrays.
const parseTextArray: (value: string) => unknown = types.getTypeParser(1009 as TypeId) // text[]

const TYPES: CustomTypesConfig = {
  getTypeParser: (oid, format) => {
    if (AS_TEXT.has(oid)) return (value: string) => value
    if (AS_TEXT_ARRAY.has(oid)) return parseTextArray
    return types.getTypeParser(oid, format)
  }
}

function clientConfig(config: ServerConnectionConfig): ClientConfig {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database || undefined,
    // Explicitly false when off: left undefined, pg would read PGSSLMODE from the environment.
    ssl: tlsOptions(config.ssl) ?? false,
    connectionTimeoutMillis: 10_000,
    application_name: 'Trowel',
    types: TYPES
  }
}

async function connected(config: ServerConnectionConfig): Promise<Client> {
  const client = new Client(clientConfig(config))
  // A dropped connection emits 'error'; unhandled, it would crash the main process. Later
  // queries reject with their own error.
  client.on('error', (err) => console.error('postgres connection error:', err.message))
  await client.connect().catch((err) => {
    throw withoutNodeHint(err)
  })
  return client
}

export class PostgresClient implements DbClient {
  private config: ServerConnectionConfig
  private client?: Client
  // The server process serving this connection, which a cancel targets.
  private pid?: number
  private running = 0

  constructor(config: ServerConnectionConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    this.client = await connected(this.config)
    const { rows } = await this.client.query<{ pid: number }>('select pg_backend_pid() as pid')
    this.pid = rows[0].pid
  }

  // Cancels a running query first: the server doesn't notice a closed connection until it sends
  // something, so it would keep running the query.
  async disconnect(): Promise<void> {
    await this.cancel().catch((err) => console.error('postgres cancel failed:', err.message))
    await this.client?.end()
    this.client = undefined
  }

  async listTables(): Promise<TableInfo[]> {
    const { rows } = await this.connection().query<{ schema: string; name: string; kind: string }>(
      LIST_TABLES
    )
    return rows.map((r) => ({
      schema: r.schema,
      name: r.name,
      type: r.kind === 'v' || r.kind === 'm' ? 'view' : 'table'
    }))
  }

  async listColumns(table: TableRef): Promise<ColumnInfo[]> {
    const { rows } = await this.connection().query<{
      name: string
      data_type: string
      nullable: boolean
      default_value: string | null
      primary_key: boolean
    }>(LIST_COLUMNS, [table.schema ?? null, table.name])
    return rows.map((r) => ({
      name: r.name,
      dataType: r.data_type,
      nullable: r.nullable,
      defaultValue: r.default_value,
      primaryKey: r.primary_key
    }))
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const client = this.connection()
    const start = performance.now()
    // Without params pg uses the simple protocol, which accepts several statements and then
    // resolves to one result per statement. Keep the last, as psql does.
    let res: QueryArrayResult | QueryArrayResult[]
    this.running++
    try {
      res = await client.query({ text: sql, values: params, rowMode: 'array' })
    } finally {
      this.running--
    }
    const durationMs = performance.now() - start
    const last = Array.isArray(res) ? res[res.length - 1] : res
    return {
      columns: last.fields.map((f) => f.name),
      rows: last.rows,
      rowCount: last.rowCount ?? last.rows.length,
      durationMs
    }
  }

  // Asks the server, over a second short-lived connection, to cancel what this connection's
  // server process is running; the query then rejects with "canceling statement due to user
  // request". An open transaction stays open, in the aborted state.
  async cancel(): Promise<void> {
    if (this.running === 0 || this.pid === undefined) return
    const other = await connected(this.config)
    try {
      await other.query('select pg_cancel_backend($1)', [this.pid])
    } finally {
      await other.end()
    }
  }

  private connection(): Client {
    if (!this.client) throw new Error('Not connected')
    return this.client
  }
}
