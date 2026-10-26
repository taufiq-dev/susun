import type { ComponentProps, ReactNode } from 'react'
import type { DbType } from '@shared/types'

// A `className` passed to these components should only add layout (margin, width, visibility).
// Two utilities that set the same property don't override by class order: whichever comes later
// in Tailwind's generated CSS wins, so a caller's `px-0` can lose to the component's `px-3`.
const BUTTON_BASE =
  'focus-ring inline-flex shrink-0 items-center justify-center disabled:pointer-events-none disabled:opacity-50'

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-on-accent hover:brightness-110',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
  danger: 'border border-line bg-surface text-danger hover:bg-sunken'
}

type ButtonProps = ComponentProps<'button'> & { variant?: keyof typeof BUTTON_VARIANTS }

export function Button({
  variant = 'secondary',
  type = 'button',
  className = '',
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={`${BUTTON_BASE} h-7 gap-1.5 rounded-[5px] px-3 font-medium whitespace-nowrap ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

const ICON_BUTTON_SIZES = {
  md: 'size-7 rounded-[5px]',
  sm: 'size-5 rounded-[4px]'
}

// A borderless square button holding an icon. `label` is its accessible name and tooltip. The
// hover tint is translucent so it shows on any background.
export function IconButton({
  label,
  size = 'md',
  type = 'button',
  className = '',
  ...props
}: ComponentProps<'button'> & {
  label: string
  size?: keyof typeof ICON_BUTTON_SIZES
}): React.JSX.Element {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`${BUTTON_BASE} ${ICON_BUTTON_SIZES[size]} text-muted hover:bg-ink/10 hover:text-ink aria-pressed:text-ink ${className}`}
      {...props}
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
                  ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]'
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
