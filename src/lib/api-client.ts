import { hc } from 'hono/client'
import type { AppType } from '../../server/index'

// Type-safe API client — replaces manual apiFetch() calls
// Usage: const res = await api.projects.$get()
export const api = hc<AppType>('/')
