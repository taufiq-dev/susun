import { getCACertificates } from 'tls'
import type { SslMode } from '@shared/types'

export interface TlsOptions {
  rejectUnauthorized: boolean
  ca?: string[]
}

// Node's TLS options for an SslMode, or undefined for a plain connection.
export function tlsOptions(mode: SslMode): TlsOptions | undefined {
  switch (mode) {
    case 'require':
      return { rejectUnauthorized: false }
    case 'verify':
      return { rejectUnauthorized: true, ca: trustedCAs() }
    default:
      return undefined
  }
}

const NODE_HINT = '; if the root CA is installed locally, try running Node.js with --use-system-ca'

// Node ends certificate errors with a hint to run it with --use-system-ca, which doesn't apply
// here: 'verify' already trusts the system store. Call on errors from connecting.
export function withoutNodeHint(err: unknown): unknown {
  if (err instanceof Error) err.message = err.message.replace(NODE_HINT, '')
  return err
}

let cas: string[] | undefined

// Node on its own trusts only its bundled Mozilla CA list (plus NODE_EXTRA_CA_CERTS). Adding the
// OS store lets a CA the user installed, such as Amazon RDS's or a company's, verify too. A `ca`
// option replaces Node's list rather than adding to it, so both are passed.
function trustedCAs(): string[] {
  cas ??= [...new Set([...getCACertificates('default'), ...getCACertificates('system')])]
  return cas
}
