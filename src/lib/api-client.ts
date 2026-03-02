import { hc } from 'hono/client'
import type { AppType } from '../../server/index'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

// Type-safe API client — replaces manual apiFetch() calls
// Usage: const res = await api.projects.$get()
export const api = hc<AppType>(`${API_BASE}/`)
