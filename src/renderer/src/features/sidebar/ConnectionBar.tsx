import { useState } from 'react'
import type { SavedConnection } from '@shared/types'
import {
  DisconnectedIcon,
  LinkIcon,
  PencilIcon,
  PowerIcon,
  RefreshIcon,
  SwitchIcon
} from '@renderer/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@renderer/components/shadcn/dropdown-menu'
import { DbMark } from '@renderer/components/ui'
import { DB_LABELS } from '@renderer/features/connect/draft'
import {
  disconnect,
  editConnection,
  reconnect,
  showAllConnections,
  switchConnection
} from '@renderer/features/workspace/connection'
import { useSession, type Session } from '@renderer/store/session'

// How many saved connections Switch connection lists.
const RECENT = 6

// The other saved connections, most recently used first (then by name, for those never used).
function recentConnections(saved: SavedConnection[], currentId?: string): SavedConnection[] {
  return saved
    .filter((c) => c.id !== currentId)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    .slice(0, RECENT)
}

// The bottom of the sidebar: the connection's name and type, or that it has been lost. Clicking it
// opens a menu above it (shadcn's DropdownMenu) to disconnect, edit the connection, switch to
// another saved one or, once lost, reconnect. A lost connection isn't an alarm, since a server may
// close idle ones as a matter of course, and it reconnects when next used.
export function ConnectionBar({ session }: { session: Session }): React.JSX.Element {
  // The other saved connections, read each time the menu opens.
  const [others, setOthers] = useState<SavedConnection[] | null>(null)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const lost = useSession((s) => s.lost)

  const onReconnect = (): void => {
    setReconnecting(true)
    void reconnect().finally(() => setReconnecting(false))
  }

  const loadOthers = (): void => {
    window.api.connections.list().then(
      (saved) => setOthers(recentConnections(saved, session.savedId)),
      (err: Error) => {
        console.error('listing saved connections failed:', err.message)
        setOthers([])
      }
    )
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && loadOthers()}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Connection: ${session.name}, ${lost ? 'disconnected' : DB_LABELS[session.type]}`}
            title={
              lost
                ? `The connection to ${session.detail} was lost. It reconnects when next used.`
                : session.detail
            }
            className="focus-ring flex h-9 w-full shrink-0 items-center gap-2 border-t border-line px-3 text-left hover:bg-ink/5 data-popup-open:bg-ink/5"
          >
            <span className={lost ? 'text-muted' : 'text-accent'}>
              {lost ? <DisconnectedIcon /> : <LinkIcon />}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              {switchingTo ? `Connecting to ${switchingTo}…` : session.name}
            </span>
            <span className="shrink-0 text-[12px] text-muted">
              {reconnecting ? 'Reconnecting…' : lost ? 'Disconnected' : DB_LABELS[session.type]}
            </span>
          </button>
        }
      />
      <DropdownMenuContent side="top" align="start" sideOffset={4} aria-label="Connection">
        {lost && (
          <DropdownMenuItem disabled={reconnecting} onClick={onReconnect}>
            <RefreshIcon />
            Reconnect
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => void disconnect()}>
          <PowerIcon />
          Disconnect
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void editConnection()}>
          <PencilIcon />
          Edit connection
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SwitchIcon />
            Switch connection
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent aria-label="Switch connection">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Recent connections</DropdownMenuLabel>
              {others?.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => void switchConnection(c, () => setSwitchingTo(c.name))}
                >
                  <DbMark type={c.config.type} className="mx-1" />
                  <span className="truncate">{c.name}</span>
                </DropdownMenuItem>
              ))}
              {others?.length === 0 && (
                <DropdownMenuItem disabled>No other saved connections</DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void showAllConnections()}>
              All connections…
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
