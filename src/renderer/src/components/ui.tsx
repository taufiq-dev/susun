import type { ComponentProps, ReactNode } from 'react'
import type { DbType } from '@shared/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/shadcn/tooltip'
import { cn } from '@renderer/lib/utils'

// A `className` passed to these components is merged with `cn`, so a caller's utility overrides
// the component's own for the same property (a caller's `px-0` beats the component's `px-3`).
const BUTTON_BASE =
  'focus-ring inline-flex shrink-0 items-center justify-center disabled:pointer-events-none disabled:opacity-50'

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-on-accent hover:brightness-110',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
  danger: 'border border-line bg-surface text-danger hover:bg-sunken'
}

// Shows the button's tooltip (shadcn's Tooltip) when given one.
function WithTooltip({
  tooltip,
  button
}: {
  tooltip?: ReactNode
  button: React.JSX.Element
}): React.JSX.Element {
  if (!tooltip) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: keyof typeof BUTTON_VARIANTS
  // Shown on hover and focus, e.g. what the button does and its shortcut.
  tooltip?: ReactNode
}

export function Button({
  variant = 'secondary',
  type = 'button',
  tooltip,
  className,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <WithTooltip
      tooltip={tooltip}
      button={
        <button
          type={type}
          className={cn(
            BUTTON_BASE,
            // The label raised 1px (by 2px of bottom padding: Chromium places text on whole pixels,
            // so 1px would round away). Centred exactly, most labels look low, since lowercase
            // letters, most of what's seen, sit in the lower part of the line. A whole-pixel line
            // height keeps the label's place the same in every button.
            'h-7 gap-1.5 rounded-[5px] px-3 pb-0.5 leading-[18px] font-medium whitespace-nowrap',
            BUTTON_VARIANTS[variant],
            className
          )}
          {...props}
        />
      }
    />
  )
}

const ICON_BUTTON_SIZES = {
  md: 'size-7 rounded-[5px]',
  sm: 'size-5 rounded-[4px]'
}

// A borderless square button holding an icon. `label` is its accessible name and its tooltip,
// unless `tooltip` says more. The hover tint is translucent so it shows on any background.
export function IconButton({
  label,
  tooltip,
  size = 'md',
  type = 'button',
  className,
  ...props
}: ComponentProps<'button'> & {
  label: string
  tooltip?: ReactNode
  size?: keyof typeof ICON_BUTTON_SIZES
}): React.JSX.Element {
  return (
    <WithTooltip
      tooltip={tooltip ?? label}
      button={
        <button
          type={type}
          aria-label={label}
          className={cn(
            BUTTON_BASE,
            ICON_BUTTON_SIZES[size],
            'text-muted hover:bg-ink/10 hover:text-ink aria-pressed:text-ink',
            className
          )}
          {...props}
        />
      }
    />
  )
}

export function TextInput({
  className = '',
  ...props
}: ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      spellCheck={false}
      className={`focus-ring h-7 w-full min-w-0 rounded-[5px] border border-line bg-surface px-2 text-ink placeholder:text-muted/70 ${className}`}
      {...props}
    />
  )
}

export function Field({
  label,
  className = '',
  children
}: {
  label: string
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </label>
  )
}

interface SegmentedOption<T> {
  value: T
  label: ReactNode
}

// A row of radio buttons styled as one control.
export function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange
}: {
  legend: string
  name: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
}): React.JSX.Element {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[12px] text-muted">{legend}</legend>
      <div className="inline-flex rounded-[6px] border border-line bg-sunken p-0.5">
        {options.map((option) => {
          const checked = option.value === value
          return (
            <label
              key={option.value}
              className={`inline-flex h-6 items-center gap-1.5 rounded-[4px] px-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                checked
                  ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--line)]'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

const DB_MARKS: Record<DbType, string> = {
  postgres: 'bg-postgres',
  mysql: 'bg-mysql',
  sqlite: 'bg-sqlite'
}

// The small square in a database type's colour.
export function DbMark({
  type,
  className = ''
}: {
  type: DbType
  className?: string
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-[2px] ${DB_MARKS[type]} ${className}`}
    />
  )
}
