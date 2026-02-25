import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind CSS classes with proper precedence
 * Combines clsx for conditional classes and tailwind-merge for deduplication
 *
 * @param {...(string|object|array)} inputs - Class values to merge
 * @returns {string} Merged class string
 *
 * @example
 * cn('px-2 py-1', 'px-4') // returns 'py-1 px-4'
 * cn('btn', { 'btn-active': isActive }) // conditional classes
 * cn('btn', ['px-2', 'py-1']) // array support
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export default cn
