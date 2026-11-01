export const IS_MAC = navigator.userAgent.includes('Mac')

// Whether the window has no title bar of its own, so the page's top band takes its place and holds
// the traffic lights: on macOS (titleBarStyle 'hidden' in src/main/index.ts). main.tsx marks it on
// <html> as `data-frameless`, which the `frameless:` variant in main.css reads.
export const FRAMELESS = IS_MAC
