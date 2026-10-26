import type { ComponentProps } from 'react'

function Icon(props: ComponentProps<'svg'>): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  )
}

export function CloseIcon(): React.JSX.Element {
  return (
    <Icon width="12" height="12">
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  )
}

export function PlusIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M8 3v10M3 8h10" />
    </Icon>
  )
}

export function RefreshIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M13 8a5 5 0 1 1-1.46-3.54" />
      <path d="M13 2.5V5h-2.5" />
    </Icon>
  )
}

export function PanelRightIcon(): React.JSX.Element {
  return (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M10 3v10" />
    </Icon>
  )
}
