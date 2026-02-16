import { twMerge } from 'tailwind-merge'
import type { ElementContext } from './edit-machine'

interface TailwindEditResult {
  newClasses: string
}

// ============================================================================
// Scale arrays for step-wise adjustments
// ============================================================================

const TEXT_SIZES = [
  'text-xs',
  'text-sm',
  'text-base',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
  'text-6xl',
]
const SPACING = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '8', '10', '12', '16', '20', '24']
const ROUNDED = [
  'rounded-none',
  'rounded-sm',
  'rounded',
  'rounded-md',
  'rounded-lg',
  'rounded-xl',
  'rounded-2xl',
  'rounded-3xl',
  'rounded-full',
]

// ============================================================================
// Color mapping
// ============================================================================

const COLOR_MAP: Record<string, string> = {
  red: 'red-500',
  blue: 'blue-500',
  green: 'green-500',
  yellow: 'yellow-500',
  purple: 'purple-500',
  pink: 'pink-500',
  orange: 'orange-500',
  gray: 'gray-500',
  grey: 'gray-500',
  black: 'black',
  white: 'white',
  indigo: 'indigo-500',
  teal: 'teal-500',
  cyan: 'cyan-500',
  lime: 'lime-500',
  amber: 'amber-500',
  emerald: 'emerald-500',
  violet: 'violet-500',
  rose: 'rose-500',
  sky: 'sky-500',
  slate: 'slate-500',
}

// ============================================================================
// Scale manipulation helpers
// ============================================================================

function scaleUp(currentClasses: string, prefix: string, scale: string[]): string {
  const classes = currentClasses.split(/\s+/)
  const current = classes.find((c) => scale.includes(c) || c.startsWith(prefix))
  const idx = current ? scale.indexOf(current) : -1

  let next: string
  if (idx >= 0 && idx < scale.length - 1) {
    next = scale[idx + 1]
  } else {
    // Default to middle of scale if not found
    next = scale[Math.min(2, scale.length - 1)]
  }

  return twMerge(currentClasses, next)
}

function scaleDown(currentClasses: string, prefix: string, scale: string[]): string {
  const classes = currentClasses.split(/\s+/)
  const current = classes.find((c) => scale.includes(c) || c.startsWith(prefix))
  const idx = current ? scale.indexOf(current) : -1

  let next: string
  if (idx > 0) {
    next = scale[idx - 1]
  } else {
    // Default to start of scale if not found
    next = scale[0]
  }

  return twMerge(currentClasses, next)
}

// ============================================================================
// Pattern definitions
// ============================================================================

interface TailwindPattern {
  match: RegExp
  apply: (classes: string, captures: string[]) => string
}

const PATTERNS: TailwindPattern[] = [
  // Background color
  {
    match: /(?:make|change|set)\s*(?:the\s+)?(?:background|bg)\s*(?:color\s*)?(?:to|=)\s*(\w+)/i,
    apply: (classes, captures) => {
      const color = COLOR_MAP[captures[0]?.toLowerCase()] || `${captures[0]}-500`
      return twMerge(classes, `bg-${color}`)
    },
  },

  // Text color
  {
    match: /(?:make|change|set)\s*(?:the\s+)?(?:text|font)\s*color\s*(?:to|=)\s*(\w+)/i,
    apply: (classes, captures) => {
      const color = COLOR_MAP[captures[0]?.toLowerCase()] || `${captures[0]}-500`
      return twMerge(classes, `text-${color}`)
    },
  },

  // Make bigger/larger
  {
    match: /(?:make|change)\s*(?:it\s+)?(?:bigger|larger)/i,
    apply: (classes) => scaleUp(classes, 'text-', TEXT_SIZES),
  },

  // Make smaller
  {
    match: /(?:make|change)\s*(?:it\s+)?(?:smaller)/i,
    apply: (classes) => scaleDown(classes, 'text-', TEXT_SIZES),
  },

  // Add/increase padding
  {
    match: /(?:add|increase|more)\s*padding/i,
    apply: (classes) => {
      // Try to increase padding by finding current p- classes
      const current = classes.split(/\s+/).find((c) => c.startsWith('p-'))
      if (current) {
        const val = current.replace('p-', '')
        const idx = SPACING.indexOf(val)
        const next = idx >= 0 && idx < SPACING.length - 1 ? SPACING[idx + 1] : SPACING[4]
        return twMerge(classes, `p-${next}`)
      }
      return twMerge(classes, 'p-4')
    },
  },

  // Reduce/decrease padding
  {
    match: /(?:reduce|decrease|less)\s*padding/i,
    apply: (classes) => {
      const current = classes.split(/\s+/).find((c) => c.startsWith('p-'))
      if (current) {
        const val = current.replace('p-', '')
        const idx = SPACING.indexOf(val)
        const next = idx > 0 ? SPACING[idx - 1] : SPACING[0]
        return twMerge(classes, `p-${next}`)
      }
      return twMerge(classes, 'p-0')
    },
  },

  // Make rounded
  {
    match: /(?:make|set)\s*(?:it\s+)?(?:rounded|round)/i,
    apply: (classes) => scaleUp(classes, 'rounded', ROUNDED),
  },

  // Make square/sharp
  {
    match: /(?:make|set)\s*(?:it\s+)?(?:square|sharp)/i,
    apply: (classes) => twMerge(classes, 'rounded-none'),
  },

  // Hide/invisible
  {
    match: /(?:hide|remove|invisible|hidden)/i,
    apply: (classes) => twMerge(classes, 'hidden'),
  },

  // Show/visible
  {
    match: /(?:show|visible|unhide)/i,
    apply: (classes) => twMerge(classes.replace(/\bhidden\b/g, ''), 'block'),
  },

  // Make bold
  {
    match: /(?:make|set)\s*(?:it\s+)?bold/i,
    apply: (classes) => twMerge(classes, 'font-bold'),
  },

  // Remove bold
  {
    match: /(?:remove|un)\s*bold/i,
    apply: (classes) => twMerge(classes, 'font-normal'),
  },

  // Center
  {
    match: /(?:center|centre)\s*(?:it|this|the\s+text)?/i,
    apply: (classes) => twMerge(classes, 'text-center'),
  },

  // Make full width
  {
    match: /(?:make|set)\s*(?:it\s+)?(?:full\s*width|w-full)/i,
    apply: (classes) => twMerge(classes, 'w-full'),
  },

  // Add border
  {
    match: /(?:add|show)\s*(?:a\s+)?border/i,
    apply: (classes) => twMerge(classes, 'border border-gray-300'),
  },

  // Remove border
  {
    match: /(?:remove|hide|no)\s*border/i,
    apply: (classes) => twMerge(classes.replace(/\bborder\b/g, ''), 'border-0'),
  },

  // Font size to specific
  {
    match: /(?:set|change)\s*(?:font\s*)?size\s*(?:to\s+)?(\w+)/i,
    apply: (classes, captures) => {
      const size = captures[0]?.toLowerCase()
      // Try to match to our TEXT_SIZES array
      const textClass = TEXT_SIZES.find((s) => s.includes(size))
      return twMerge(classes, textClass || `text-${size}`)
    },
  },

  // Opacity
  {
    match: /(?:make|set)\s*(?:it\s+)?(?:transparent|semi.?transparent|opacity)/i,
    apply: (classes) => twMerge(classes, 'opacity-50'),
  },

  // Color to hex (direct)
  {
    match: /(?:color|bg|background)\s*(?:to\s+)?#([0-9a-fA-F]{3,6})/i,
    apply: (classes, captures) => {
      const hex = captures[0]
      // For arbitrary values, use Tailwind's bracket notation
      return twMerge(classes, `bg-[#${hex}]`)
    },
  },

  // Text align left
  {
    match: /(?:align|text)\s*(?:to\s+)?left/i,
    apply: (classes) => twMerge(classes, 'text-left'),
  },

  // Text align right
  {
    match: /(?:align|text)\s*(?:to\s+)?right/i,
    apply: (classes) => twMerge(classes, 'text-right'),
  },

  // Add shadow
  {
    match: /(?:add|show)\s*(?:a\s+)?shadow/i,
    apply: (classes) => twMerge(classes, 'shadow-md'),
  },

  // Remove shadow
  {
    match: /(?:remove|hide|no)\s*shadow/i,
    apply: (classes) => twMerge(classes, 'shadow-none'),
  },
]

// ============================================================================
// Main export
// ============================================================================

/** Try a deterministic Tailwind class edit. Returns null if not applicable. */
export function tryTailwindEdit(
  message: string,
  element: ElementContext,
): TailwindEditResult | null {
  const classes = element.className

  // Try each pattern in order
  for (const pattern of PATTERNS) {
    const match = message.match(pattern.match)
    if (match) {
      try {
        const captures = match.slice(1) // Remove full match, keep capture groups
        const newClasses = pattern.apply(classes, captures)
        if (newClasses !== classes) {
          return { newClasses }
        }
      } catch {
        // Pattern failed to apply — continue to next pattern
        continue
      }
    }
  }

  return null
}
