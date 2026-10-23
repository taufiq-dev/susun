import { Client, type QueryArrayResult } from 'pg'
import type {
  ColumnInfo,
  QueryResult,
  ServerConnectionConfig,
  TableInfo,
  TableRef
} from '@shared/types'
import type { DbClient } from './client'

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

export class PostgresClient implements DbClient {
  private client: Client

  constructor(config: ServerConnectionConfig) {
    this.client = new Client({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || undefined,
      connectionTimeoutMillis: 10_000
    })
    // A dropped connection emits 'error'; unhandled, it would crash the main process. Later
    // queries reject with their own error.
    this.client.on('error', (err) => console.error('postgres connection error:', err.message))
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    await this.client.end()
  }

  async listTables(): Promise<TableInfo[]> {
    const { rows } = await this.client.query<{ schema: string; name: string; kind: string }>(
      LIST_TABLES
    )
    return rows.map((r) => ({
      schema: r.schema,
      name: r.name,
      type: r.kind === 'v' || r.kind === 'm' ? 'view' : 'table'
    }))
  }

  async listColumns(table: TableRef): Promise<ColumnInfo[]> {
    const { rows } = await this.client.query<{
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
    const start = performance.now()
    // Without params pg uses the simple protocol, which accepts several statements and then
    // resolves to one result per statement. Show the last, as psql does.
    const res = (await this.client.query({ text: sql, values: params, rowMode: 'array' })) as
      QueryArrayResult | QueryArrayResult[]
    const durationMs = performance.now() - start
    const last = Array.isArray(res) ? res[res.length - 1] : res
    return {
      columns: last.fields.map((f) => f.name),
      rows: last.rows,
      rowCount: last.rowCount ?? last.rows.length,
      durationMs
    }
  }
}
