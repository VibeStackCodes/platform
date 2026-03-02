// app.ts — Vercel zero-config Hono entry point
// Vercel auto-detects this file and routes all requests through the Hono app.
// See: https://vercel.com/docs/frameworks/backend/hono
import { Hono } from 'hono'
export { default } from './server/index'

// Re-export types for client API type inference
export type { AppType } from './server/index'

// Ensure Hono import is not tree-shaken (Vercel scans for it)
void Hono
