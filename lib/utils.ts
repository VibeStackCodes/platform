import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import pluralize from "pluralize"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Strip markdown code fences (```lang ... ```) from LLM output */
export function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:typescript|tsx|jsx|javascript|ts|js|json)?\s*\n/, '');
    cleaned = cleaned.replace(/\n```\s*$/, '');
  }
  return cleaned;
}

/** Pluralize a table name using the `pluralize` library (440+ rules) */
export function pluralizeTable(name: string): string {
  return pluralize(name);
}
