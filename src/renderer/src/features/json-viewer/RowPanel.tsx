import { SidePanel } from '@renderer/components/SidePanel'

// The selected row as JSON. Step 12 fills it in; until then it only explains itself.
export function RowPanel(): React.JSX.Element {
  return (
    <SidePanel id="row" side="right" label="Row" resizeLabel="Resize the row panel">
      <h2 className="px-3 pt-2.5 pb-1 text-[12px] font-semibold">Row</h2>
      <p className="px-3 text-[12px] text-muted">
        Select a row in a table or query result to see it here as JSON.
      </p>
    </SidePanel>
  )
}
