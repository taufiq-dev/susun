import SusunSymbol from '@renderer/assets/susun-logo.svg?react'
import SusunWordmark from '@renderer/assets/susun-wordmark.svg?react'
import { cn } from '@renderer/lib/utils'

// The design's units: the symbol is 195 wide and 148 tall, and the wordmark, 578 by 116, sits 25 to
// its right and 22 down from its top.
const UNITS = 148

// Susun's logo: the symbol with the wordmark beside it, from the two SVGs in assets/. Their slate is
// the text colour (svgr makes it currentColor; see electron.vite.config.ts), here `logo`, which
// turns light in dark mode. `height` is the symbol's, in px; the rest scales with it.
export function Logo({
  height = 16,
  className
}: {
  height?: number
  className?: string
}): React.JSX.Element {
  const unit = height / UNITS
  return (
    <span
      role="img"
      aria-label="Susun"
      className={cn('flex shrink-0 items-start text-logo', className)}
    >
      <SusunSymbol aria-hidden style={{ width: 195 * unit, height }} />
      <SusunWordmark
        aria-hidden
        style={{
          width: 578 * unit,
          height: 116 * unit,
          marginLeft: 25 * unit,
          marginTop: 22 * unit
        }}
      />
    </span>
  )
}
