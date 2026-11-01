import { HistoryIcon, SavedQueriesIcon, TablesIcon } from '@renderer/components/icons'
import { moveFocus } from '@renderer/components/roving'
import { SidePanel } from '@renderer/components/SidePanel'
import { useLayout, type SidebarView } from '@renderer/store/layout'
import type { Session } from '@renderer/store/session'
import { ConnectionBar } from './ConnectionBar'
import { History } from './History'
import { SavedQueries } from './SavedQueries'
import { TableList } from './TableList'

const VIEWS: { id: SidebarView; label: string; icon: React.JSX.Element }[] = [
  { id: 'tables', label: 'Tables', icon: <TablesIcon /> },
  { id: 'saved', label: 'Saved queries', icon: <SavedQueriesIcon /> },
  { id: 'history', label: 'Recent queries', icon: <HistoryIcon /> }
]

// The workspace's left side: the activity bar, which picks a view (tables, saved queries, recent
// queries), the view, and the connection bar beneath both. The views stay mounted while hidden,
// so each keeps its filter and scroll, and the tables aren't fetched again.
export function Sidebar({ session }: { session: Session }): React.JSX.Element {
  const view = useLayout((s) => s.sidebarView)
  const setView = useLayout((s) => s.setSidebarView)

  return (
    <SidePanel id="sidebar" side="left" resizeLabel="Resize the sidebar" className="select-none">
      <div className="flex min-h-0 flex-1">
        <div
          role="tablist"
          aria-label="Sidebar"
          aria-orientation="vertical"
          onKeyDown={(e) => moveFocus(e, e.currentTarget, '[role=tab]', 'vertical', true)?.click()}
          className="flex w-11 shrink-0 flex-col border-r border-line pt-1"
        >
          {VIEWS.map((v) => {
            const selected = v.id === view
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={v.label}
                title={v.label}
                tabIndex={selected ? 0 : -1}
                onClick={() => setView(v.id)}
                className={`focus-ring relative flex h-10 w-full items-center justify-center ${
                  selected ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {selected && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-accent" />
                )}
                {v.icon}
              </button>
            )
          })}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className={view === 'tables' ? 'contents' : 'hidden'}>
            <TableList connectionId={session.connectionId} />
          </div>
          <div className={view === 'saved' ? 'contents' : 'hidden'}>
            <SavedQueries connectionId={session.connectionId} />
          </div>
          <div className={view === 'history' ? 'contents' : 'hidden'}>
            <History connectionId={session.connectionId} />
          </div>
        </div>
      </div>
      <ConnectionBar session={session} />
    </SidePanel>
  )
}
