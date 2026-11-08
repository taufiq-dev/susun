import {
  Client,
  types,
  type ClientConfig,
  type CustomTypesConfig,
  type QueryResult as PgResult
} from 'pg'
import { Socket } from 'net'
import Cursor from 'pg-cursor'
import {
  ROW_LIMIT,
  type ColumnInfo,
  type ForeignKeyInfo,
  type QueryResult,
  type ServerConnectionConfig,
  type TableInfo,
  type TableRef
} from '@shared/types'
import type { DbClient } from './client'
import { stopsAtLimit } from './limit'
import { CONNECT_TIMEOUT_MS, KEEPALIVE_DELAY_MS, NOT_POSTGRES, connectError } from './errors'
import { tlsOptions } from './tls'

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

// The columns of several tables at once, as LIST_COLUMNS gives them, each row with its table's
// place in the arrays of schemas and names (from 1).
const LIST_COLUMNS_OF = `
  select t.place,
    a.attname as name,
    format_type(a.atttypid, a.atttypmod) as data_type,
    not a.attnotnull as nullable,
    pg_get_expr(d.adbin, d.adrelid) as default_value,
    pk.indrelid is not null as primary_key
  from unnest($1::text[], $2::text[]) with ordinality as t(schema, name, place)
  join pg_namespace n on n.nspname = coalesce(t.schema, current_schema())
  join pg_class c on c.relnamespace = n.oid and c.relname = t.name
  join pg_attribute a on a.attrelid = c.oid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  left join pg_index pk
    on pk.indrelid = a.attrelid and pk.indisprimary and a.attnum = any(pk.indkey)
  where a.attnum > 0 and not a.attisdropped
  order by t.place, a.attnum`

// Foreign keys between the tables LIST_TABLES lists. A key on a partitioned table, or to one, is
// copied onto its partitions, which are left out here as they are there.
const LIST_FOREIGN_KEYS = `
  select c.conname as name,
    tn.nspname as schema, t.relname as table,
    rn.nspname as ref_schema, r.relname as ref_table,
    array(
      select a.attname::text from unnest(c.conkey) with ordinality k(num, place)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.num order by k.place
    ) as columns,
    array(
      select a.attname::text from unnest(c.confkey) with ordinality k(num, place)
      join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.num order by k.place
    ) as ref_columns,
    c.confupdtype as on_update, c.confdeltype as on_delete
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace tn on tn.oid = t.relnamespace
  join pg_class r on r.oid = c.confrelid
  join pg_namespace rn on rn.oid = r.relnamespace
  where c.contype = 'f' and not t.relispartition and not r.relispartition
    and tn.nspname not in ('pg_catalog', 'information_schema')
    and tn.nspname not like 'pg\\_toast%'
    and tn.nspname not like 'pg\\_temp\\_%'
  order by tn.nspname, t.relname, c.conname`

// pg_constraint's codes for a foreign key's actions.
const FK_ACTIONS: Record<string, string> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT'
}

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

// Reads up to `maxRows` rows. The promise form of `cursor.read` drops the result, which holds the
// column names. After an error the cursor calls back a second time; the promise keeps the first.
function read(
  cursor: Cursor<unknown[]>,
  maxRows: number
): Promise<{ rows: unknown[][]; result: PgResult }> {
  return new Promise((resolve, reject) => {
    cursor.read(maxRows, (err, rows, result) => (err ? reject(err) : resolve({ rows, result })))
  })
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
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: KEEPALIVE_DELAY_MS,
    stream: () => new GuardedSocket(),
    application_name: 'Trowel',
    types: TYPES
  }
}

// pg parses what the server sends in the socket's 'data' handler, and on bytes that aren't the
// Postgres protocol (as when the port is a MySQL server's) it throws there, where nothing can catch
// it: the main process would get an uncaught exception and the connect would never settle. This
// socket turns such a throw into a socket error, which fails the connect (or the query) instead.
class GuardedSocket extends Socket {
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    try {
      return super.emit(event, ...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.destroy(
        Object.assign(new Error(`Not the PostgreSQL protocol: ${message}`), { code: NOT_POSTGRES })
      )
      return true
    }
  }
}

async function connected(config: ServerConnectionConfig): Promise<Client> {
  const client = new Client(clientConfig(config))
  // A dropped connection emits 'error'; unhandled, it would crash the main process.
  client.on('error', (err) => console.error('postgres connection error:', err.message))
  await client.connect().catch((err) => {
    throw connectError(err, config)
  })
  return client
}

export class PostgresClient implements DbClient {
  private config: ServerConnectionConfig
  private client?: Client
  // The server process serving this connection, which a cancel targets.
  private pid?: number
  private running = 0
  private lostListener?: (reason: string) => void

  constructor(config: ServerConnectionConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    const client = await connected(this.config)
    this.client = client
    client.on('error', (err) => this.lost(client, err.message))
    client.on('end', () => this.lost(client, 'Connection terminated'))
    const { rows } = await client.query<{ pid: number }>('select pg_backend_pid() as pid')
    this.pid = rows[0].pid
  }

  // Cancels a running query first: the server doesn't notice a closed connection until it sends
  // something, so it would keep running the query.
  async disconnect(): Promise<void> {
    await this.cancel().catch((err) => console.error('postgres cancel failed:', err.message))
    const client = this.client
    // First, so that its ending doesn't count as losing it.
    this.client = undefined
    await client?.end()
  }

  onLost(listener: (reason: string) => void): void {
    this.lostListener = listener
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

  async listColumnsOf(tables: TableRef[]): Promise<ColumnInfo[][]> {
    const columns: ColumnInfo[][] = tables.map(() => [])
    if (tables.length === 0) return columns
    const { rows } = await this.connection().query<{
      place: string
      name: string
      data_type: string
      nullable: boolean
      default_value: string | null
      primary_key: boolean
    }>(LIST_COLUMNS_OF, [tables.map((t) => t.schema ?? null), tables.map((t) => t.name)])
    for (const r of rows) {
      // `place` is a bigint, so it arrives as a string.
      columns[Number(r.place) - 1]?.push({
        name: r.name,
        dataType: r.data_type,
        nullable: r.nullable,
        defaultValue: r.default_value,
        primaryKey: r.primary_key
      })
    }
    return columns
  }

  async listForeignKeys(): Promise<ForeignKeyInfo[]> {
    const { rows } = await this.connection().query<{
      name: string
      schema: string
      table: string
      ref_schema: string
      ref_table: string
      columns: string[]
      ref_columns: string[]
      on_update: string
      on_delete: string
    }>(LIST_FOREIGN_KEYS)
    return rows.map((r) => ({
      name: r.name,
      table: { schema: r.schema, name: r.table },
      columns: r.columns,
      references: { schema: r.ref_schema, name: r.ref_table },
      referencedColumns: r.ref_columns,
      onUpdate: FK_ACTIONS[r.on_update] ?? r.on_update,
      onDelete: FK_ACTIONS[r.on_delete] ?? r.on_delete
    }))
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const client = this.connection()
    const start = performance.now()
    // A cursor asks for one row more than the limit, then closes, so the server stops producing
    // rows there instead of sending them all (see stopsAtLimit). Cursors take one statement.
    const cursor = client.query(
      new Cursor<unknown[]>(sql, params, { rowMode: 'array', types: TYPES })
    )
    this.running++
    try {
      const { rows, result } = await read(cursor, ROW_LIMIT + 1)
      const truncated = rows.length > ROW_LIMIT
      // Ends the statement if it has more rows; otherwise the cursor has already closed.
      await cursor.close()
      const durationMs = performance.now() - start
      return {
        columns: result.fields.map((f) => f.name),
        rows: truncated ? rows.slice(0, ROW_LIMIT) : rows,
        rowCount: truncated ? null : (result.rowCount ?? rows.length),
        truncated,
        stopped: truncated && stopsAtLimit(sql),
        durationMs
      }
    } catch (err) {
      // The server's last word: it closes the connection next, but this rejects first.
      const { severity } = err as { severity?: string }
      if (severity === 'FATAL' || severity === 'PANIC') this.lost(client, (err as Error).message)
      throw err
    } finally {
      this.running--
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

  private lost(client: Client, reason: string): void {
    if (this.client === client) this.lostListener?.(reason)
  }
}
