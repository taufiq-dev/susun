import { useTabs, type QueryTabState } from '@renderer/store/tabs'

// A plain text area for now; step 9 replaces it with CodeMirror and runs the query.
export function QueryTab({ tab }: { tab: QueryTabState }): React.JSX.Element {
  const setSql = useTabs((s) => s.setSql)
  return (
    <textarea
      aria-label={`SQL for ${tab.title}`}
      autoFocus
      spellCheck={false}
      value={tab.sql}
      placeholder="select * from …"
      onChange={(e) => setSql(tab.id, e.target.value)}
      className="block h-full w-full resize-none bg-surface p-4 font-mono text-[13px] leading-relaxed text-ink outline-none placeholder:text-muted/70"
    />
  )
}
