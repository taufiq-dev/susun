import { describe, expect, it } from 'vitest'
import type { QueryResult } from '@shared/types'
import type { DbClient } from './client'
import { ReconnectingClient, mayKeepState } from './reconnecting'

const RESULT: QueryResult = { columns: [], rows: [], rowCount: 0, durationMs: 0 }

// A connection that does what each test says, and records what it was asked.
class FakeClient implements DbClient {
  ran: string[] = []
  connected = false
  disconnected = false
  cancels = 0
  connectError?: Error
  // Connecting waits for this.
  connectGate?: Promise<void>
  // A query the test settles itself.
  held?: { resolve: (r: QueryResult) => void; reject: (err: Error) => void }
  hold = false
  private listener?: (reason: string) => void

  async connect(): Promise<void> {
    await this.connectGate
    if (this.connectError) throw this.connectError
    this.connected = true
  }
  async disconnect(): Promise<void> {
    this.disconnected = true
  }
  async listTables(): Promise<[]> {
    this.ran.push('listTables')
    return []
  }
  async listColumns(): Promise<[]> {
    this.ran.push('listColumns')
    return []
  }
  async listColumnsOf(): Promise<[]> {
    this.ran.push('listColumnsOf')
    return []
  }
  async listForeignKeys(): Promise<[]> {
    this.ran.push('listForeignKeys')
    return []
  }
  query(sql: string): Promise<QueryResult> {
    this.ran.push(sql)
    if (!this.hold) return Promise.resolve(RESULT)
    return new Promise((resolve, reject) => {
      this.held = { resolve, reject }
    })
  }
  async cancel(): Promise<void> {
    this.cancels++
  }
  onLost(listener: (reason: string) => void): void {
    this.listener = listener
  }
  lose(reason = 'server went away'): void {
    this.listener?.(reason)
  }
}

interface Setup {
  session: ReconnectingClient
  clients: FakeClient[]
  changes: boolean[]
}

// A session whose connections are FakeClients. `next` configures each new one, given how many came
// before it.
async function setup(
  inMemory = false,
  next: (c: FakeClient, before: number) => void = () => {}
): Promise<Setup> {
  const clients: FakeClient[] = []
  const changes: boolean[] = []
  const session = new ReconnectingClient(
    () => {
      const client = new FakeClient()
      next(client, clients.length)
      clients.push(client)
      return client
    },
    { inMemory, onChange: (lost) => changes.push(lost) }
  )
  await session.connect()
  return { session, clients, changes }
}

describe('ReconnectingClient', () => {
  it('reconnects quietly when the session held no state', async () => {
    const { session, clients, changes } = await setup()
    await session.query('select 1')
    clients[0].lose()
    expect(changes).toEqual([true])
    await session.query('select 2')
    expect(clients).toHaveLength(2)
    expect(clients[0].ran).toEqual(['select 1'])
    expect(clients[1].ran).toEqual(['select 2'])
    expect(clients[1].connected).toBe(true)
    expect(clients[0].disconnected).toBe(true)
    expect(changes).toEqual([true, false])
  })

  it('reconnects the sidebar’s calls too', async () => {
    const { session, clients } = await setup()
    clients[0].lose()
    await session.listTables()
    expect(clients[1].ran).toEqual(['listTables'])
  })

  it('holds back the next statement once if the session may have held state', async () => {
    const { session, clients } = await setup()
    await session.query('begin')
    await session.query('update t set a = 1')
    clients[0].lose()
    await expect(session.query('commit')).rejects.toThrow(/lost, so this wasn’t run/)
    expect(clients).toHaveLength(1)
    await session.query('commit')
    expect(clients[1].ran).toEqual(['commit'])
    expect(clients[0].ran).not.toContain('commit')
  })

  it('counts the state as gone once told, with the new connection', async () => {
    const { session, clients } = await setup()
    await session.query('set search_path to x')
    clients[0].lose()
    await expect(session.query('select 1')).rejects.toThrow(/session settings are gone/)
    await session.query('select 1')
    clients[1].lose()
    await session.query('select 2')
    expect(clients[2].ran).toEqual(['select 2'])
  })

  it('fails a statement running when the connection goes, and doesn’t send it again', async () => {
    const { session, clients } = await setup()
    clients[0].hold = true
    const running = session.query('update t set a = 1')
    await Promise.resolve()
    await Promise.resolve()
    clients[0].lose('terminated')
    clients[0].held!.reject(new Error('terminated'))
    await expect(running).rejects.toThrow(/may not have finished[\s\S]*terminated/)
    expect(clients).toHaveLength(1)
    await session.query('select 1')
    expect(clients[1].ran).toEqual(['select 1'])
  })

  it('says what was lost with a running statement, and doesn’t say it twice', async () => {
    const { session, clients } = await setup()
    await session.query('begin')
    clients[0].hold = true
    const running = session.query('update t set a = 1')
    await Promise.resolve()
    await Promise.resolve()
    clients[0].lose()
    clients[0].held!.reject(new Error('gone'))
    await expect(running).rejects.toThrow(/open transaction was rolled back/)
    await session.query('select 1')
    expect(clients[1].ran).toEqual(['select 1'])
  })

  it('leaves a statement’s own error alone', async () => {
    const { session, clients } = await setup()
    clients[0].hold = true
    const running = session.query('select nope')
    await Promise.resolve()
    await Promise.resolve()
    const error = new Error('column "nope" does not exist')
    clients[0].held!.reject(error)
    await expect(running).rejects.toBe(error)
  })

  it('stays lost if connecting fails, and tries again next time', async () => {
    let refuse = true
    const { session, clients, changes } = await setup(false, (c, before) => {
      if (before > 0 && refuse) c.connectError = new Error('refused')
    })
    clients[0].lose()
    await expect(session.query('select 1')).rejects.toThrow('refused')
    await expect(session.listTables()).rejects.toThrow('refused')
    expect(changes).toEqual([true])
    refuse = false
    await session.query('select 2')
    expect(changes).toEqual([true, false])
    expect(clients.at(-1)?.ran).toEqual(['select 2'])
  })

  it('opens one new connection for calls made together', async () => {
    const { session, clients } = await setup()
    clients[0].lose()
    await Promise.all([session.listTables(), session.query('select 1'), session.reconnect()])
    expect(clients).toHaveLength(2)
    expect(clients[1].ran.sort()).toEqual(['listTables', 'select 1'])
  })

  it('reconnects on request, and does nothing when connected', async () => {
    const { session, clients, changes } = await setup()
    await session.reconnect()
    expect(clients).toHaveLength(1)
    clients[0].lose()
    await session.reconnect()
    expect(clients).toHaveLength(2)
    expect(changes).toEqual([true, false])
  })

  it('doesn’t count its own disconnect as a loss', async () => {
    const { session, clients, changes } = await setup()
    await session.disconnect()
    clients[0].lose()
    expect(changes).toEqual([])
  })

  it('closes a connection that finishes opening after the session closed', async () => {
    let open = (): void => {}
    const gate = new Promise<void>((resolve) => (open = resolve))
    const { session, clients } = await setup(false, (c, before) => {
      if (before > 0) c.connectGate = gate
    })
    clients[0].lose()
    const reconnecting = session.query('select 1')
    await Promise.resolve()
    await session.disconnect()
    open()
    await expect(reconnecting).rejects.toThrow('Connection closed')
    expect(clients[1].disconnected).toBe(true)
    expect(clients[1].ran).toEqual([])
  })

  it('cancels a reconnect in progress rather than run the statement after it', async () => {
    let open = (): void => {}
    const gate = new Promise<void>((resolve) => (open = resolve))
    const { session, clients } = await setup(false, (c, before) => {
      if (before === 1) c.connectGate = gate
    })
    clients[0].lose()
    const reconnecting = session.query('delete from t')
    await Promise.resolve()
    await session.cancel()
    open()
    await expect(reconnecting).rejects.toThrow('Cancelled')
    expect(clients[1].ran).toEqual([])
    expect(clients[1].disconnected).toBe(true)
    expect(clients[0].cancels).toBe(0)
    await session.query('select 1')
    expect(clients[2].ran).toEqual(['select 1'])
  })

  it('passes a cancel on while connected, and ignores it while lost', async () => {
    const { session, clients } = await setup()
    await session.cancel()
    expect(clients[0].cancels).toBe(1)
    clients[0].lose()
    await session.cancel()
    expect(clients[0].cancels).toBe(1)
  })

  it('tells each time an in-memory database is lost, with no statements needed', async () => {
    const { session, clients } = await setup(true)
    clients[0].lose()
    await expect(session.listTables()).rejects.toThrow(/in memory, so everything in it is gone/)
    await session.listTables()
    expect(clients).toHaveLength(2)
    clients[1].lose()
    await expect(session.query('select 1')).rejects.toThrow(/in memory/)
    await session.query('select 1')
    expect(clients).toHaveLength(3)
  })
})

describe('mayKeepState', () => {
  it.each([
    'select 1',
    '  SELECT * from t',
    '-- a comment\nselect 1',
    '/* a comment */ select 1',
    '(select 1) union (select 2)',
    'with x as (select 1) select * from x',
    'values (1)',
    'table t',
    'show search_path',
    'explain select 1',
    'describe t',
    'desc t',
    'insert into t values (1)',
    'update t set a = 1',
    'delete from t',
    'replace into t values (1)',
    'merge into t using u on true when matched then delete',
    'truncate t',
    'drop table t'
  ])('is no for %s', (sql) => {
    expect(mayKeepState(sql)).toBe(false)
  })

  it.each([
    'begin',
    'start transaction',
    'commit',
    'savepoint a',
    'set search_path to x',
    'use other',
    'create temp table t (a int)',
    'create table t (a int)',
    'prepare p as select 1',
    'declare c cursor for select 1',
    'listen ch',
    'lock table t',
    'pragma foreign_keys = on',
    'attach database ? as other',
    'call p()',
    'do $$ begin end $$',
    '',
    '-- only a comment',
    'nonsense',
    "select set_config('search_path', 'x', false)",
    'select pg_advisory_lock(1)',
    "select get_lock('a', 1)",
    'select @a := 1',
    'select 1 into @a',
    'select * into temp t from u',
    'with x as (select 1) select * into temp t from x',
    '/*!40101 SET NAMES utf8 */',
    '/*M!100100 SET x = 1 */ select 1',
    'select 1 /*!40101 , sleep(1) */'
  ])('is yes for %s', (sql) => {
    expect(mayKeepState(sql)).toBe(true)
  })
})
