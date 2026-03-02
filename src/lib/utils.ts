import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supabase } from './supabase-browser'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Base URL for API calls — empty string for same-origin (dev), full URL for cross-origin (prod) */
const API_BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * Authenticated fetch — injects Supabase session token as Authorization header.
 * Drop-in replacement for `fetch()` for all /api/* calls.
 * Prepends API_BASE for relative paths (e.g., '/api/health' → 'https://api.vibestackhq.com/api/health').
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const url = typeof input === 'string' && input.startsWith('/api') ? `${API_BASE}${input}` : input
  return fetch(url, { ...init, headers })
}
