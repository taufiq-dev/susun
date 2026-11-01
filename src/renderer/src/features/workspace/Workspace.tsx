import { useState } from 'react'
import { PanelRightIcon } from '@renderer/components/icons'
import { MainArea } from '@renderer/components/SidePanel'
import { Button, DbMark, IconButton } from '@renderer/components/ui'
import { RowPanel } from '@renderer/features/json-viewer/RowPanel'
import { TableList } from '@renderer/features/sidebar/TableList'
import { useSession, type Session } from '@renderer/store/session'
import { useTabs } from '@renderer/store/tabs'
import { Panes } from './Panes'
import { useWorkspaceShortcuts } from './shortcuts'

export function Workspace({ session }: { session: Session }): React.JSX.Element {
  const [showRow, setShowRow] = useState(true)
  useWorkspaceShortcuts()

  return (
    // The connection's database type sets the accent colour for the whole workspace.
    <div data-db={session.type} className="flex h-full flex-col">
      {/* The window's top band; on macOS it is the title bar, holding the traffic lights (frameless). */}
      <header className="flex h-10 shrink-0 items-center gap-2.5 border-t-2 border-b border-t-accent border-b-line bg-sunken pr-2 pl-3 select-none frameless:app-drag frameless:pl-20">
        <DbMark type={session.type} />
        <span className="truncate font-semibold">{session.name}</span>
        {session.detail !== session.name && (
          <span className="truncate text-[12px] text-muted">{session.detail}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1 app-no-drag">
          <IconButton
            label="Row panel"
            aria-pressed={showRow}
            onClick={() => setShowRow((v) => !v)}
          >
            <PanelRightIcon />
          </IconButton>
          <DisconnectButton />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <TableList connectionId={session.connectionId} />
        <MainArea className="flex">
          <Panes connectionId={session.connectionId} dbType={session.type} />
        </MainArea>
        {showRow && <RowPanel />}
      </div>
    </div>
  )
}

// Disconnecting closes every tab. When that would lose work (a query tab's SQL, or a query still
// running), the first click asks for a second, as Delete does on the connect screen; clicking or
// tabbing away, or Escape, takes the question back.
function DisconnectButton(): React.JSX.Element {
  const close = useSession((s) => s.close)
  const atRisk = useTabs(
    (s) =>
      s.tabs.filter(
        (t) => t.type === 'query' && (t.sql.trim() !== '' || t.run?.state === 'running')
      ).length
  )
  const [confirming, setConfirming] = useState(false)

  return (
    <Button
      variant={confirming ? 'danger' : 'secondary'}
      onClick={() => {
        if (atRisk > 0 && !confirming) setConfirming(true)
        else void close()
      }}
      onBlur={() => setConfirming(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setConfirming(false)
      }}
    >
      {confirming
        ? `Close ${atRisk === 1 ? 'a query tab' : `${atRisk} query tabs`} and disconnect`
        : 'Disconnect'}
    </Button>
  )
}
