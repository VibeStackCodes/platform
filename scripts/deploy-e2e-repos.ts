#!/usr/bin/env bun
/**
 * Deploy the 3 E2E test repos to Vercel using their committed dist/ output.
 * Repos already have dist/ committed (pre-.gitignore fix), so no rebuild needed.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const VERCEL_TOKEN = process.env.VERCEL_TOKEN!
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || undefined

const REPOS = [
  {
    name: 'markshelf-bookmarks',
    repo: 'VibeStackCodes-Generated/vibestack-e2e-test-1771370658498',
    appName: 'MarkShelf (Bookmarks)',
  },
  {
    name: 'teamboard-tasks',
    repo: 'VibeStackCodes-Generated/vibestack-e2e-test-1771370687872',
    appName: 'TeamBoard (Task Board)',
  },
  {
    name: 'pennypulse-finance',
    repo: 'VibeStackCodes-Generated/vibestack-e2e-test-1771371038575',
    appName: 'PennyPulse (Finance Tracker)',
  },
]

async function fetchGitHubFile(repo: string, path: string): Promise<Buffer> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: { Accept: 'application/vnd.github.raw+json' },
  })
  if (!res.ok) throw new Error(`GitHub fetch failed for ${path}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function fetchGitHubTree(repo: string, treePath: string): Promise<string[]> {
  // List all files under treePath recursively via tree API
  const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status}`)
  const data = (await res.json()) as { tree: Array<{ path: string; type: string }> }
  return data.tree
    .filter((f) => f.type === 'blob' && f.path.startsWith(treePath + '/'))
    .map((f) => f.path)
}

async function deployToVercel(appName: string, name: string, files: Array<{ file: string; data: string }>) {
  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ''

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://api.vercel.com/v13/deployments${teamQuery}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        files,
        projectSettings: {
          framework: null,
          buildCommand: null,
          outputDirectory: null,
        },
        target: 'production',
      }),
    })

    if (res.ok || res.status < 500) {
      const data = (await res.json()) as { id?: string; url?: string; error?: { message: string } }
      if (data.error) throw new Error(`Vercel error: ${data.error.message}`)
      console.log(`  [${appName}] Deployment created: ${data.id}`)
      return data
    }

    if (attempt === 0) {
      console.log(`  [${appName}] Vercel returned ${res.status}, retrying...`)
      await new Promise((r) => setTimeout(r, 2000))
    } else {
      throw new Error(`Vercel deployment failed after 2 attempts: ${res.status}`)
    }
  }
  throw new Error('Should not reach here')
}

async function waitForReady(deploymentId: string, appName: string): Promise<string> {
  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ''

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}${teamQuery}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    })
    const data = (await res.json()) as { readyState?: string; url?: string }
    if (data.readyState === 'READY') {
      return `https://${data.url}`
    }
    if (data.readyState === 'ERROR' || data.readyState === 'CANCELED') {
      throw new Error(`Deployment ${deploymentId} failed with state: ${data.readyState}`)
    }
    process.stdout.write(`  [${appName}] ${data.readyState ?? 'pending'}...\r`)
  }
  throw new Error(`Deployment ${deploymentId} timed out after 90s`)
}

async function deployRepo(repo: typeof REPOS[0]) {
  console.log(`\n=== ${repo.appName} ===`)
  console.log(`  Fetching dist/ from ${repo.repo}...`)

  const distPaths = await fetchGitHubTree(repo.repo, 'dist')
  console.log(`  Found ${distPaths.length} files in dist/`)

  const files: Array<{ file: string; data: string; encoding?: string }> = []

  for (const path of distPaths) {
    const content = await fetchGitHubFile(repo.repo, path)
    const relativePath = path.replace(/^dist\//, '')
    // Text files can be sent as-is; binary files need base64 + encoding field
    const isText = /\.(html|js|css|txt|json|svg|map)$/.test(relativePath)
    if (isText) {
      files.push({ file: relativePath, data: content.toString('utf-8') })
    } else {
      files.push({ file: relativePath, data: content.toString('base64'), encoding: 'base64' })
    }
  }

  const deployment = await deployToVercel(repo.appName, repo.name, files)
  const url = await waitForReady(deployment.id!, repo.appName)
  console.log(`\n  ✓ Live at: ${url}`)
  return { appName: repo.appName, url }
}

async function main() {
  console.log('Deploying 3 E2E test repos to Vercel...\n')

  const results: Array<{ appName: string; url: string }> = []

  for (const repo of REPOS) {
    try {
      const result = await deployRepo(repo)
      results.push(result)
    } catch (err) {
      console.error(`  ✗ ${repo.appName} failed:`, err)
    }
  }

  console.log('\n\n=== Deployment Summary ===')
  for (const r of results) {
    console.log(`${r.appName}: ${r.url}`)
  }
}

main().catch(console.error)
