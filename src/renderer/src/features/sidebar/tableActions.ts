import { dropSql, selectTopSql, truncateSql } from '@shared/sql'
import type { DbType, TableInfo } from '@shared/types'
import { sameTable, useTabs } from '@renderer/store/tabs'

// What a table's right-click menu in the Tables view does. Changes run on the connection's own
// session, after a native confirmation; a failure is shown in a native dialog.

function shownName(table: TableInfo): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name
}

// Opens the table's tab on its rows.
export function viewData(table: TableInfo): void {
  useTabs.getState().openTable(table, 'data')
}

// Opens the table's tab on its columns.
export function viewStructure(table: TableInfo): void {
  useTabs.getState().openTable(table, 'structure')
}

// Opens an ER diagram of the table and the tables its foreign keys link it to.
export function erDiagram(table: TableInfo): void {
  useTabs.getState().openDiagram(table)
}

// Opens a query tab with a SELECT of the table's first rows, not run.
export function selectTop(type: DbType, table: TableInfo): void {
  useTabs.getState().openQuery(undefined, selectTopSql(type, table))
}

export function copyName(table: TableInfo): void {
  navigator.clipboard.writeText(table.name).catch((err: Error) => {
    console.error('copying failed:', err.message)
  })
}

async function run(connectionId: string, sql: string, failure: string): Promise<boolean> {
  try {
    await window.api.db.query(connectionId, sql)
    return true
  } catch (err) {
    await window.api.dialog.showError(failure, (err as Error).message)
    return false
  }
}

// Empties the table, once the user confirms.
export async function truncate(
  connectionId: string,
  type: DbType,
  table: TableInfo
): Promise<void> {
  const name = shownName(table)
  const confirmed = await window.api.dialog.confirm(
    `Delete every row of “${name}”?`,
    'The table stays, empty. This can’t be undone.',
    type === 'sqlite' ? 'Delete rows' : 'Truncate'
  )
  if (confirmed) await run(connectionId, truncateSql(type, table), `Couldn’t empty “${name}”`)
}

// Drops the table or view, once the user confirms; then closes its tabs (its data and its diagrams)
// and calls `dropped`.
export async function drop(
  connectionId: string,
  type: DbType,
  table: TableInfo,
  dropped: () => void
): Promise<void> {
  const name = shownName(table)
  const view = table.type === 'view'
  const confirmed = await window.api.dialog.confirm(
    `Drop the ${view ? 'view' : 'table'} “${name}”?`,
    view
      ? 'This deletes the view, not the tables it reads. It can’t be undone.'
      : 'This deletes the table and all its rows. It can’t be undone.',
    view ? 'Drop view' : 'Drop table'
  )
  if (!confirmed) return
  if (!(await run(connectionId, dropSql(type, table), `Couldn’t drop “${name}”`))) return
  const { tabs, close } = useTabs.getState()
  for (const tab of tabs) {
    if (tab.type !== 'query' && sameTable(tab.table, table)) close(tab.id)
  }
  dropped()
}
