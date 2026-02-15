import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Strip markdown code fences (```lang ... ```) from LLM output */
export function stripCodeFences(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:typescript|tsx|jsx|javascript|ts|js|json)?\s*\n/, '')
    cleaned = cleaned.replace(/\n```\s*$/, '')
  }
  return cleaned
}
