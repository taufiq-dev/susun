import { useEffect, useState } from 'react'
import { PanelRightIcon } from '@renderer/components/icons'
import { MainArea } from '@renderer/components/SidePanel'
import { IconButton } from '@renderer/components/ui'
import { RowPanel } from '@renderer/features/json-viewer/RowPanel'
import { Sidebar } from '@renderer/features/sidebar/Sidebar'
import { useSession, type Session } from '@renderer/store/session'
import { Panes } from './Panes'
import { useWorkspaceShortcuts } from './shortcuts'

export function Workspace({ session }: { session: Session }): React.JSX.Element {
  const [showRow, setShowRow] = useState(true)
  useWorkspaceShortcuts()

  useEffect(
    () =>
      window.api.app.onConnectionChanged(({ connectionId, lost }) => {
        useSession.getState().connectionChanged(connectionId, lost)
      }),
    []
  )

  return (
    // The connection's database type sets the accent colour for the whole workspace.
    <div data-db={session.type} className="flex h-full flex-col">
      {/* The window's top band; on macOS it is the title bar, holding the traffic lights
          (frameless). The connection's name and menu are in the sidebar's connection bar. */}
      <header className="flex h-10 shrink-0 items-center border-b border-line bg-sunken pr-2 pl-3 select-none frameless:app-drag frameless:pl-20">
        <div className="ml-auto flex shrink-0 items-center gap-1 app-no-drag">
          <IconButton
            label="Row panel"
            aria-pressed={showRow}
            onClick={() => setShowRow((v) => !v)}
          >
            <PanelRightIcon />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar session={session} />
        <MainArea className="flex">
          <Panes connectionId={session.connectionId} dbType={session.type} />
        </MainArea>
        {showRow && <RowPanel />}
      </div>
    </div>
  )
}
