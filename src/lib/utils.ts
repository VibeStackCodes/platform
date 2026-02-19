import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './supabase-browser'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Authenticated fetch — injects Supabase session token as Authorization header.
 * Drop-in replacement for `fetch()` for all /api/* calls.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(input, { ...init, headers })
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
