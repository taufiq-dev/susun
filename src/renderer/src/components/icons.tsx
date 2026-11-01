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

export function SplitRightIcon(): React.JSX.Element {
  return (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M8 3v10" />
    </Icon>
  )
}

export function MaximizeIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
    </Icon>
  )
}

export function RestoreIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M13.5 6.5h-4v-4M2.5 9.5h4v4M9.5 6.5 14 2M6.5 9.5 2 14" />
    </Icon>
  )
}

// The activity bar's icons, larger than the rest.

export function TablesIcon(): React.JSX.Element {
  return (
    <Icon width="18" height="18">
      <ellipse cx="8" cy="3.75" rx="5" ry="1.75" />
      <path d="M3 3.75v8.5c0 .97 2.24 1.75 5 1.75s5-.78 5-1.75v-8.5" />
      <path d="M3 8c0 .97 2.24 1.75 5 1.75S13 8.97 13 8" />
    </Icon>
  )
}

export function SavedQueriesIcon(): React.JSX.Element {
  return (
    <Icon width="18" height="18">
      <path d="M9.5 1.75H4.25a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V5Z" />
      <path d="M9.5 1.75V5h3.25" />
      <path d="m6.75 8-1.5 1.75 1.5 1.75M9.25 8l1.5 1.75-1.5 1.75" />
    </Icon>
  )
}

export function HistoryIcon(): React.JSX.Element {
  return (
    <Icon width="18" height="18">
      <path d="M2.75 8a5.25 5.25 0 1 0 1.54-3.71" />
      <path d="M2.5 2.25v2.5H5" />
      <path d="M8 5.25V8l1.75 1.25" />
    </Icon>
  )
}

export function LinkIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M6.75 9.25a2.5 2.5 0 0 0 3.54 0l2-2a2.5 2.5 0 0 0-3.54-3.54l-.5.5" />
      <path d="M9.25 6.75a2.5 2.5 0 0 0-3.54 0l-2 2a2.5 2.5 0 0 0 3.54 3.54l.5-.5" />
    </Icon>
  )
}

export function PowerIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M8 2v5.5" />
      <path d="M4.46 4.46a5 5 0 1 0 7.08 0" />
    </Icon>
  )
}

export function PencilIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M10.5 2.75 13.25 5.5 6 12.75H3.25V10Z" />
      <path d="m9 4.25 2.75 2.75" />
    </Icon>
  )
}

export function SwitchIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8" />
      <path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13" />
    </Icon>
  )
}

export function ChevronRightIcon(): React.JSX.Element {
  return (
    <Icon width="12" height="12">
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </Icon>
  )
}

export function FolderOpenIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M2 12.5V4a1 1 0 0 1 1-1h3l1.5 1.5H12a1 1 0 0 1 1 1V7" />
      <path d="M2 12.5 3.75 7.5a1 1 0 0 1 .94-.67h9.36a.5.5 0 0 1 .47.66L13 12.5Z" />
    </Icon>
  )
}

export function TrashIcon(): React.JSX.Element {
  return (
    <Icon>
      <path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5" />
      <path d="M4 4.25l.6 8.6a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.6" />
    </Icon>
  )
}
