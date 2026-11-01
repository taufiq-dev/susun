import type {
  ColumnInfo,
  ConnectionConfig,
  HistoryEntry,
  NewHistoryEntry,
  QueryFileEntry,
  QueryResult,
  SavedConnection,
  SavedConnectionInput,
  Settings,
  TableInfo,
  TableRef
} from './types'

// What preload exposes as `window.api`. Each method is an `ipcMain.handle` channel named
// `<group>:<method>`, so `api.db.query` is `db:query`. The exceptions are the `on...` methods of
// `AppApi`, which listen for messages the main process sends (see `AppEvents`).
export interface Api {
  db: DbApi
  connections: ConnectionsApi
  dialog: DialogApi
  files: FilesApi
  history: HistoryApi
  settings: SettingsApi
  app: AppApi
}

// A connection has its own session, which calls given the connection id run on, and can open more.
// A session is one database connection (on SQLite, one process), so the queries of different
// sessions run side by side, and each has its own transactions, temp tables and settings.
export interface DbApi {
  // Opens a connection and returns its id. Closing or reloading the window closes it. `savedId` is
  // the saved connection it is, if any, which marks it as just used, and files the connection's
  // query files and history under it (rather than under its address).
  connect(config: ConnectionConfig, savedId?: string): Promise<string>
  // Closes the connection and its sessions.
  disconnect(connectionId: string): Promise<void>
  // Opens another session on the connection and returns its id. Each query tab has one. An
  // in-memory SQLite database exists only in the connection's own session, so for one this
  // returns the connection id.
  openSession(connectionId: string): Promise<string>
  // Closes a session from `openSession`, stopping its running query. Does nothing for a connection
  // id or a session already closed.
  closeSession(sessionId: string): Promise<void>
  listTables(connectionId: string): Promise<TableInfo[]>
  listColumns(connectionId: string, table: TableRef): Promise<ColumnInfo[]>
  // `sessionId` is from `openSession`, or a connection id for the connection's own session.
  query(sessionId: string, sql: string, params?: unknown[]): Promise<QueryResult>
  // Stops the query running in the session, which then rejects. Does nothing if none is running or
  // the session is closed. On SQLite this reopens the database, which loses the session's state
  // (an open transaction, temp tables, attached databases, settings).
  cancel(sessionId: string): Promise<void>
}

// Saved connections. These are stored configs, not open connections: pass one's `config` to
// `db.connect` to open it.
export interface ConnectionsApi {
  // Sorted by name, with passwords decrypted.
  list(): Promise<SavedConnection[]>
  save(connection: SavedConnectionInput): Promise<SavedConnection>
  // Does nothing if no saved connection has that id.
  remove(id: string): Promise<void>
}

export interface DialogApi {
  // Asks the user to pick a SQLite database file. Resolves to its path, or null if cancelled.
  openSqliteFile(): Promise<string | null>
}

// A .sql file and its text.
export interface SqlFile {
  path: string
  sql: string
}

// Query tabs' .sql files. A window can only write to files the user picked in its Open or Save
// dialogs, or opened from a connection's list, so a page can't write wherever it likes. A file
// opened or saved while connected (given a `connectionId`) goes on that connection's list.
export interface FilesApi {
  // Asks the user for a .sql file to open. Resolves to it, or null if cancelled or reading failed
  // (the user is told why in a dialog).
  openSql(connectionId: string | null): Promise<SqlFile | null>
  // Reads a file on the connection's list. Resolves to null if reading failed (the user is told).
  readSql(connectionId: string, path: string): Promise<SqlFile | null>
  // Writes the SQL to `path` (a file this window opened or saved), or with no path first asks where
  // to save it, suggesting `name`. Resolves to the path written, or null if the user cancelled or
  // writing failed (the user is told why in a dialog).
  saveSql(
    sql: string,
    path: string | null,
    name: string,
    connectionId: string | null
  ): Promise<string | null>
  // The connection's files, most recently used first.
  list(connectionId: string): Promise<QueryFileEntry[]>
  // Takes a file off the connection's list (the file itself stays).
  forget(connectionId: string, path: string): Promise<void>
}

// Each connection's runs, kept between launches (the last 1,000).
export interface HistoryApi {
  // Newest first.
  list(connectionId: string): Promise<HistoryEntry[]>
  add(connectionId: string, entry: NewHistoryEntry): Promise<void>
  clear(connectionId: string): Promise<void>
}

export interface SettingsApi {
  get(): Promise<Settings>
  // Changes some settings and tells every window (`AppApi.onSettingsChanged`).
  set(changes: Partial<Settings>): Promise<Settings>
}

// Why query tabs with unsaved SQL are about to close.
export type CloseReason = 'close-tab' | 'disconnect' | 'switch' | 'close-window'

// The answer to the save prompt. When the user has turned the prompt off, it is 'discard'.
export type SaveChoice = 'save' | 'discard' | 'cancel'

// What the app menu (or the main process) asks the focused window's page to do.
export type AppCommand =
  | 'new-query'
  | 'open'
  | 'save'
  | 'save-as'
  | 'close-tab'
  // The window is closing (its close button, Close Window, or quitting): the page settles its
  // unsaved query tabs, then calls `closeWindow`, or doesn't if the user cancels.
  | 'close-window'

// Messages the main process sends a window's page, by channel.
export interface AppEvents {
  'app:command': AppCommand
  'app:settingsChanged': Settings
}

export interface AppApi {
  // Asks whether to save the query tabs with these titles before they close, in a native dialog
  // with Save, Don't Save and Cancel, and a "Don't ask again" checkbox that turns the setting off.
  // Resolves to 'discard' without asking if the setting is off.
  confirmSave(titles: string[], reason: CloseReason): Promise<SaveChoice>
  // Closes this window without asking again, and carries on quitting if quitting is what closed it.
  closeWindow(): Promise<void>
  // Listen for messages from the main process; each returns a function that stops listening.
  onCommand(listener: (command: AppCommand) => void): () => void
  onSettingsChanged(listener: (settings: Settings) => void): () => void
}

// How a handler's outcome crosses IPC. An error thrown in a handler would reach the renderer
// prefixed with "Error invoking remote method 'db:query': Error: ", so handlers return this
// instead and preload throws `message` as a plain Error.
export type IpcResult<T> = { ok: true; value: T } | { ok: false; message: string }
