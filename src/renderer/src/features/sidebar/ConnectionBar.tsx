import { useCallback, useState } from 'react'
import type { SavedConnection } from '@shared/types'
import { ContextMenu, type MenuEntry } from '@renderer/components/ContextMenu'
import { LinkIcon, PencilIcon, PowerIcon, SwitchIcon } from '@renderer/components/icons'
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

// The bottom of the sidebar: the connection's name and type. Clicking it opens a menu above it to
// disconnect, edit the connection, or switch to another saved one.
export function ConnectionBar({ session }: { session: Session }): React.JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number; others: SavedConnection[] } | null>(null)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  const openMenu = async (button: HTMLElement): Promise<void> => {
    const rect = button.getBoundingClientRect()
    const saved = await window.api.connections.list().catch((err: Error) => {
      console.error('listing saved connections failed:', err.message)
      return []
    })
    setMenu({
      x: rect.left + 4,
      y: rect.top - 4,
      others: recentConnections(saved, session.savedId)
    })
  }

  const items = (others: SavedConnection[]): MenuEntry[] => [
    { label: 'Disconnect', icon: <PowerIcon />, onSelect: () => void disconnect() },
    { label: 'Edit connection', icon: <PencilIcon />, onSelect: () => void editConnection() },
    {
      label: 'Switch connection',
      icon: <SwitchIcon />,
      submenu: [
        { heading: 'Recent connections' },
        ...(others.length > 0
          ? others.map((c): MenuEntry => ({
              label: c.name,
              icon: <DbMark type={c.config.type} />,
              onSelect: () => void switchConnection(c, () => setSwitchingTo(c.name))
            }))
          : [{ label: 'No other saved connections', disabled: true }]),
        'separator',
        { label: 'All connections…', onSelect: () => void showAllConnections() }
      ]
    }
  ]

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        aria-label={`Connection: ${session.name}, ${DB_LABELS[session.type]}`}
        title={session.detail}
        onClick={(e) => void openMenu(e.currentTarget)}
        className="focus-ring flex h-9 w-full shrink-0 items-center gap-2 border-t border-line px-3 text-left hover:bg-ink/5"
      >
        <span className="text-accent">
          <LinkIcon />
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold">
          {switchingTo ? `Connecting to ${switchingTo}…` : session.name}
        </span>
        <span className="shrink-0 text-[12px] text-muted">{DB_LABELS[session.type]}</span>
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          above
          label="Connection"
          items={items(menu.others)}
          onClose={closeMenu}
        />
      )}
    </>
  )
}
