// Types shared by the main process, preload and renderer. Keep this folder free of Node, Electron
// and DOM APIs, since it is compiled for both sides.

export const DB_TYPES = ['postgres', 'mysql', 'sqlite'] as const

export type DbType = (typeof DB_TYPES)[number]
