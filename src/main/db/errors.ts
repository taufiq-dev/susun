import type { ServerConnectionConfig } from '@shared/types'
import { withoutNodeHint } from './tls'

// How long the clients wait for a connection to be set up.
export const CONNECT_TIMEOUT_MS = 10_000

// How long a connection sits idle before the OS starts checking that the other end is still there.
// A network drop sends nothing, so without this a connection looks fine until a query has hung on
// it for minutes. The checks are TCP's own, below SQL, so they don't keep a serverless database
// awake.
export const KEEPALIVE_DELAY_MS = 30_000

// The code of the error `GuardedSocket` (postgres.ts) fails a connection with when the server
// doesn't speak the Postgres protocol.
export const NOT_POSTGRES = 'ERR_SUSUN_NOT_POSTGRES'

// An error's message. Connecting to "localhost" tries ::1 and 127.0.0.1, and if both fail Node
// throws an AggregateError with an empty message; its inner errors say what happened.
export function errorMessage(err: unknown): string {
  if (err instanceof AggregateError && !err.message) {
    return err.errors.map(errorMessage).join('; ')
  }
  if (err instanceof Error) return err.message || err.name
  return String(err)
}

// What to tell the user about a failed connection, for the failures whose driver message is only
// a code (such as "connect ECONNREFUSED ::1:5432"). Undefined for the rest, whose messages say
// what's wrong already (such as Postgres's "password authentication failed for user ...").
function explain(err: unknown, { host, port }: ServerConnectionConfig): string | undefined {
  const code = (err as { code?: unknown }).code
  const message = errorMessage(err)
  const at = `${host}:${port}`
  const timedOut = `Nothing answered at ${at} within ${CONNECT_TIMEOUT_MS / 1000} seconds. Check the host, the port and the database type, and that a firewall isn’t in the way.`
  switch (code) {
    case 'ECONNREFUSED':
      return `Nothing is accepting connections at ${at}. Check that the server is running, and the host and port.`
    case 'ENOTFOUND':
      return `Couldn’t find a host called “${host}”. Check its name.`
    case 'EAI_AGAIN':
      return `Couldn’t look up the host “${host}”. Check the network connection.`
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Can’t reach ${host} from this computer. Check the host, and the network or VPN connection.`
    case 'ETIMEDOUT':
      return timedOut
    case NOT_POSTGRES:
      return `The server at ${at} didn’t answer as PostgreSQL does. Check the port, and whether it’s a MySQL or MariaDB server.`
  }
  // pg's own connect timeout has no code.
  if (/^timeout expired$|connection timeout/i.test(message)) return timedOut
  return undefined
}

// The error to report for a failed connection: plain words, a blank line, then the driver's
// message as the detail, when the driver's message alone wouldn't say what's wrong. The renderer
// shows the first paragraph as the message and the rest as detail.
export function connectError(err: unknown, config: ServerConnectionConfig): unknown {
  withoutNodeHint(err)
  const plain = explain(err, config)
  return plain ? new Error(`${plain}\n\n${errorMessage(err)}`) : err
}
