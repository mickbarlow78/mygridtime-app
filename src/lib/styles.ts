/**
 * UI style system — shared className constants and utilities.
 *
 * Usage: import { cn, CARD, BTN_PRIMARY } from '@/lib/styles'
 *
 * These constants encode the canonical Tailwind classes for each UI element.
 * Prefer these over ad-hoc inline strings so the app stays visually consistent.
 */

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Join class names, filtering out falsy values. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const PAGE_BG = 'min-h-screen bg-gray-50'
export const HEADER = 'bg-white border-b border-gray-200'
export const HEADER_INNER =
  'max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4'

/** Full-width page container (dashboards, editors, public pages). */
export const CONTAINER_FULL = 'max-w-6xl mx-auto px-4 sm:px-6'

/** Form-width container (settings, new-event). */
export const CONTAINER_FORM = 'max-w-2xl'

/** Narrow container (single-purpose creation forms). */
export const CONTAINER_NARROW = 'max-w-lg'

/** Auth-width container (login, invite accept). */
export const CONTAINER_AUTH = 'max-w-sm w-full'

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export const CARD = 'bg-white rounded-lg border border-gray-200'
export const CARD_PADDING = 'px-6 py-5'
export const CARD_PADDING_COMPACT = 'px-4 py-4'

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export const LIST_CARD =
  'bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden'
export const LIST_ROW = 'flex items-center justify-between px-4 py-3'

// ---------------------------------------------------------------------------
// Form elements
// ---------------------------------------------------------------------------

export const LABEL = 'block text-sm font-medium text-gray-700 mb-1.5'
export const LABEL_COMPACT = 'block text-xs font-medium text-gray-600 mb-1'
export const INPUT =
  'w-full text-sm px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'
export const HELP_TEXT = 'text-xs text-gray-400 mt-1'
export const ERROR_BANNER =
  'text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2'
export const SUCCESS_BANNER =
  'text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2'

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export const BTN_PRIMARY =
  'px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-40 transition-colors'
export const BTN_PRIMARY_SM =
  'px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-md hover:bg-gray-700 disabled:opacity-40 transition-colors'
export const BTN_SECONDARY =
  'px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors'
export const BTN_SECONDARY_SM =
  'px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors'
export const BTN_GHOST = 'text-sm text-gray-500 hover:text-gray-700 transition-colors'
export const BTN_GHOST_SM = 'text-xs text-gray-500 hover:text-gray-700 transition-colors'
export const BTN_DESTRUCTIVE =
  'px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors'

// ---------------------------------------------------------------------------
// Headings
// ---------------------------------------------------------------------------

export const H1 = 'text-xl font-semibold text-gray-900'
export const H1_PUBLIC = 'text-xl sm:text-2xl font-semibold text-gray-900 leading-tight'
export const H2 = 'text-sm font-semibold text-gray-900'
export const SUBTITLE = 'text-sm text-gray-500 mt-0.5'

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export const TAB_BAR = 'flex gap-1 border-b border-gray-200 -mb-px'
export const TAB_ACTIVE =
  'px-4 py-2 text-sm font-medium border-b-2 border-gray-900 text-gray-900 -mb-px transition-colors'
export const TAB_INACTIVE =
  'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 -mb-px transition-colors'

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

export const BREADCRUMB = 'flex items-center gap-2 text-sm text-gray-500'
export const BREADCRUMB_LINK = 'hover:text-gray-800 transition-colors'
export const BREADCRUMB_SEP = 'text-gray-300'
export const BREADCRUMB_CURRENT = 'text-gray-800'

// ---------------------------------------------------------------------------
// Auth actions (header right side)
// ---------------------------------------------------------------------------

export const AUTH_EMAIL = 'text-xs text-gray-400 hidden sm:block'
export const AUTH_LINK =
  'text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2 transition-colors'
export const HEADER_NAV_LINK =
  'text-xs text-gray-400 hover:text-gray-600 transition-colors hidden sm:block'
