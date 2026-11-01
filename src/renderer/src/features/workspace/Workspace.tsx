import { useState } from 'react'
import { PanelRightIcon } from '@renderer/components/icons'
import { MainArea } from '@renderer/components/SidePanel'
import { Button, DbMark, IconButton } from '@renderer/components/ui'
import { RowPanel } from '@renderer/features/json-viewer/RowPanel'
import { TableList } from '@renderer/features/sidebar/TableList'
import { useSession, type Session } from '@renderer/store/session'
import { Panes } from './Panes'
import { useWorkspaceShortcuts } from './shortcuts'

export function Workspace({ session }: { session: Session }): React.JSX.Element {
  const [showRow, setShowRow] = useState(true)
  const close = useSession((s) => s.close)
  useWorkspaceShortcuts()

  return (
    // The connection's database type sets the accent colour for the whole workspace.
    <div data-db={session.type} className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2.5 border-t-2 border-b border-t-accent border-b-line bg-sunken pr-2 pl-3 select-none">
        <DbMark type={session.type} />
        <span className="truncate font-semibold">{session.name}</span>
        {session.detail !== session.name && (
          <span className="truncate text-[12px] text-muted">{session.detail}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <IconButton
            label="Row panel"
            aria-pressed={showRow}
            onClick={() => setShowRow((v) => !v)}
          >
            <PanelRightIcon />
          </IconButton>
          <Button onClick={() => void close()}>Disconnect</Button>
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
