import { useState } from 'react'
import { PanelRightIcon } from '@renderer/components/icons'
import { Button, DbMark, IconButton } from '@renderer/components/ui'
import { RowPanel } from '@renderer/features/json-viewer/RowPanel'
import { QueryTab } from '@renderer/features/query/QueryTab'
import { TableList } from '@renderer/features/sidebar/TableList'
import { TableTab } from '@renderer/features/table/TableTab'
import { useSession, type Session } from '@renderer/store/session'
import { useTabs } from '@renderer/store/tabs'
import { TabBar } from './TabBar'

export function Workspace({ session }: { session: Session }): React.JSX.Element {
  const [showRow, setShowRow] = useState(true)
  const close = useSession((s) => s.close)
  const active = useTabs((s) => s.tabs.find((t) => t.id === s.activeId))
  const openQuery = useTabs((s) => s.openQuery)

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
        <main className="flex min-w-0 flex-1 flex-col bg-surface">
          <TabBar />
          <div className="min-h-0 flex-1">
            {active?.type === 'query' && (
              <QueryTab
                key={active.id}
                tab={active}
                connectionId={session.connectionId}
                dbType={session.type}
              />
            )}
            {active?.type === 'table' && (
              <TableTab key={active.id} tab={active} connectionId={session.connectionId} />
            )}
            {!active && (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <p className="text-muted">Open a table from the list, or start a new query.</p>
                <Button onClick={openQuery}>New query</Button>
              </div>
            )}
          </div>
        </main>
        {showRow && <RowPanel />}
      </div>
    </div>
  )
}
