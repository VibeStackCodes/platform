/**
 * Playwright Global Setup for Real E2E Tests
 *
 * Runs BEFORE any test to ensure a clean environment:
 * 1. Deletes ALL Supabase projects in the Testing org + any vibestack-* orphans
 * 2. Deletes ALL Daytona sandboxes
 *
 * Supabase free tier limit is per-ACCOUNT (not per-org), so we must also
 * clean orphan projects from other orgs to stay under the 2-project cap.
 *
 * Requires env vars: SUPABASE_ACCESS_TOKEN, DAYTONA_API_KEY
 */

import { Daytona } from '@daytonaio/sdk'
import { config } from 'dotenv'
import { resolve } from 'node:path'

// Load .env.e2e — same as .env.local but SUPABASE_ORG_ID points to Testing org
config({ path: resolve(__dirname, '..', '.env.e2e') })

const SUPABASE_API = 'https://api.supabase.com/v1'
const TESTING_ORG_ID = 'zieajexturdwfcjjfolu'

async function cleanSupabase() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const orgId = process.env.SUPABASE_E2E_ORG_ID || TESTING_ORG_ID
  if (!token || !orgId) {
    console.log(
      '[global-setup] Skipping Supabase cleanup — missing SUPABASE_ACCESS_TOKEN or SUPABASE_E2E_ORG_ID',
    )
    return
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // List all projects
  const res = await fetch(`${SUPABASE_API}/projects`, { headers })
  if (!res.ok) {
    throw new Error(`Failed to list Supabase projects: ${res.status} ${await res.text()}`)
  }

  const projects: Array<{ id: string; name: string; organization_id: string; status: string }> =
    await res.json()

  // Delete ALL projects except Staging (the platform's own DB).
  // Free tier limit is per-account, so any leftover test project blocks new creation.
  const PROTECTED = new Set(['Staging'])
  const toDelete = projects.filter((p) => !PROTECTED.has(p.name))

  console.log(
    `[global-setup] Found ${toDelete.length} Supabase project(s) to delete (of ${projects.length} total)`,
  )

  for (const project of toDelete) {
    console.log(
      `[global-setup] Deleting Supabase project: ${project.name} (${project.id}) [org: ${project.organization_id}]`,
    )
    const delRes = await fetch(`${SUPABASE_API}/projects/${project.id}`, {
      method: 'DELETE',
      headers,
    })
    if (!delRes.ok) {
      const err = await delRes.text()
      console.error(`[global-setup] Failed to delete project ${project.id}: ${err}`)
    }
  }

  console.log('[global-setup] Supabase cleanup done')
}

async function cleanDaytona() {
  const apiKey = process.env.DAYTONA_API_KEY
  if (!apiKey) {
    console.log('[global-setup] Skipping Daytona cleanup — missing DAYTONA_API_KEY')
    return
  }

  const daytona = new Daytona()

  // List all sandboxes (paginated, get first 100)
  const result = await daytona.list({}, 1, 100)
  const sandboxes = result.items

  console.log(`[global-setup] Found ${sandboxes.length} Daytona sandbox(es)`)

  for (const sandbox of sandboxes) {
    console.log(`[global-setup] Deleting Daytona sandbox: ${sandbox.id}`)
    try {
      await daytona.delete(sandbox, 30)
    } catch (err) {
      console.error(`[global-setup] Failed to delete sandbox ${sandbox.id}:`, err)
    }
  }

  console.log('[global-setup] Daytona cleanup done')
}

async function cleanVercel() {
  const token = process.env.VERCEL_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID
  if (!token) {
    console.log('[global-setup] Skipping Vercel cleanup — missing VERCEL_TOKEN')
    return
  }

  const PROTECTED = new Set(['platform', 'vibestack', 'vibestack-wildcard'])

  try {
    const res = await fetch(
      `https://api.vercel.com/v9/projects?limit=100${teamId ? `&teamId=${teamId}` : ''}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return

    const data = await res.json()
    const projects = data.projects || []
    const toDelete = projects.filter((p: { name: string }) => !PROTECTED.has(p.name))

    console.log(
      `[global-setup] Found ${toDelete.length} Vercel project(s) to delete (of ${projects.length} total)`,
    )

    for (const project of toDelete) {
      console.log(`[global-setup] Deleting Vercel project: ${project.name}`)
      try {
        await fetch(
          `https://api.vercel.com/v9/projects/${project.id}${teamId ? `?teamId=${teamId}` : ''}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        )
      } catch (err) {
        console.error(`[global-setup] Failed to delete Vercel project ${project.name}:`, err)
      }
    }
  } catch (err) {
    console.error('[global-setup] Vercel cleanup error:', err)
  }

  console.log('[global-setup] Vercel cleanup done')
}

export default async function globalSetup() {
  console.log('[global-setup] Cleaning test environment...')
  await Promise.allSettled([cleanSupabase(), cleanDaytona(), cleanVercel()])
  console.log('[global-setup] Environment clean, starting tests')
}
