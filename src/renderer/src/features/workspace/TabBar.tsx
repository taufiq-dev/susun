import { CloseIcon, PlusIcon } from '@renderer/components/icons'
import { IconButton } from '@renderer/components/ui'
import { endSession } from '@renderer/features/query/run'
import { useSession } from '@renderer/store/session'
import { useTabs } from '@renderer/store/tabs'

export function TabBar(): React.JSX.Element {
  const tabs = useTabs((s) => s.tabs)
  const activeId = useTabs((s) => s.activeId)
  const activate = useTabs((s) => s.activate)
  const closeTab = useTabs((s) => s.close)
  const connectionId = useSession((s) => s.session?.connectionId)

  const close = (id: string): void => {
    if (connectionId) endSession(connectionId, id)
    closeTab(id)
  }
  const openQuery = useTabs((s) => s.openQuery)

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-sunken select-none">
      <div role="tablist" aria-label="Open tabs" className="flex min-w-0 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeId
          return (
            <div
              key={tab.id}
              role="presentation"
              className={`group flex max-w-52 shrink-0 items-center border-r border-line ${
                active
                  ? 'bg-surface text-ink shadow-[inset_0_2px_0_var(--accent)]'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={
                  tab.type === 'table' && tab.table.schema
                    ? `${tab.table.schema}.${tab.title}`
                    : tab.title
                }
                onClick={() => activate(tab.id)}
                // Middle-click closes, as in a browser.
                onAuxClick={(e) => {
                  if (e.button === 1) close(tab.id)
                }}
                className="focus-ring h-full min-w-0 truncate pr-1 pl-3 text-left"
              >
                {tab.title}
              </button>
              <IconButton
                label={`Close ${tab.title}`}
                onClick={() => close(tab.id)}
                size="sm"
                className={`mr-1 ${active ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
              >
                <CloseIcon />
              </IconButton>
            </div>
          )
        })}
      </div>
      <IconButton label="New query" onClick={openQuery} className="m-1">
        <PlusIcon />
      </IconButton>
    </div>
  )
}
