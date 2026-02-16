import type { ElementContext } from './edit-machine'

interface TailwindEditResult {
  newClasses: string
}

/** Try a deterministic Tailwind class edit. Returns null if not applicable. */
export function tryTailwindEdit(
  _message: string,
  _element: ElementContext,
): TailwindEditResult | null {
  // Stub — will be implemented in Phase C
  return null
}
