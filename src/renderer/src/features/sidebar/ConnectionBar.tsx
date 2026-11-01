import { useState } from 'react'
import type { SavedConnection } from '@shared/types'
import { LinkIcon, PencilIcon, PowerIcon, SwitchIcon } from '@renderer/components/icons'
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
  showAllConnections,
  switchConnection
} from '@renderer/features/workspace/connection'
import type { Session } from '@renderer/store/session'

// How many saved connections Switch connection lists.
const RECENT = 6

// The other saved connections, most recently used first (then by name, for those never used).
function recentConnections(saved: SavedConnection[], currentId?: string): SavedConnection[] {
  return saved
    .filter((c) => c.id !== currentId)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    .slice(0, RECENT)
}

// The bottom of the sidebar: the connection's name and type. Clicking it opens a menu above it
// (shadcn's DropdownMenu) to disconnect, edit the connection, or switch to another saved one.
export function ConnectionBar({ session }: { session: Session }): React.JSX.Element {
  // The other saved connections, read each time the menu opens.
  const [others, setOthers] = useState<SavedConnection[] | null>(null)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)

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
            aria-label={`Connection: ${session.name}, ${DB_LABELS[session.type]}`}
            title={session.detail}
            className="focus-ring flex h-9 w-full shrink-0 items-center gap-2 border-t border-line px-3 text-left hover:bg-ink/5 data-popup-open:bg-ink/5"
          >
            <span className="text-accent">
              <LinkIcon />
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              {switchingTo ? `Connecting to ${switchingTo}…` : session.name}
            </span>
            <span className="shrink-0 text-[12px] text-muted">{DB_LABELS[session.type]}</span>
          </button>
        }
      />
      <DropdownMenuContent side="top" align="start" sideOffset={4} aria-label="Connection">
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
