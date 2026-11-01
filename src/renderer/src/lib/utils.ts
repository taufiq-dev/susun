import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Joins class names, and where two Tailwind utilities set the same property, keeps the later one,
// so a caller's class overrides a component's own (the shadcn/ui components rely on it).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
