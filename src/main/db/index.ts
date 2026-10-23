import type { ConnectionConfig } from '@shared/types'
import type { DbClient } from './client'
import { MysqlClient } from './mysql'
import { PostgresClient } from './postgres'
import { SqliteClient } from './sqlite'

export type { DbClient } from './client'

export function createClient(config: ConnectionConfig): DbClient {
  switch (config.type) {
    case 'postgres':
      return new PostgresClient(config)
    case 'mysql':
      return new MysqlClient(config)
    case 'sqlite':
      return new SqliteClient(config)
  }
}
