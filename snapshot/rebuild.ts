#!/usr/bin/env bun
/**
 * Rebuild Daytona Snapshot
 *
 * Builds the snapshot Docker image via Daytona's SDK (no local Docker needed)
 * and registers it as a new snapshot. Updates .env.local with the new snapshot ID.
 *
 * Usage:
 *   bun snapshot/rebuild.ts                    # Build + register
 *   bun snapshot/rebuild.ts --name my-snap     # Custom snapshot name
 *   bun snapshot/rebuild.ts --dry-run          # Show Dockerfile only
 */

import { Daytona, Image } from '@daytonaio/sdk'
import { resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const nameIdx = args.indexOf('--name')
const snapshotName = nameIdx !== -1 ? args[nameIdx + 1] : `vibestack-${Date.now()}`

if (!snapshotName) {
  console.error('Error: --name requires a value')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Env check
// ---------------------------------------------------------------------------

if (!dryRun && !process.env.DAYTONA_API_KEY) {
  console.error('Error: DAYTONA_API_KEY is required. Set it in .env.local')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Build image from Dockerfile
// ---------------------------------------------------------------------------

const snapshotDir = resolve(import.meta.dirname!, '.')
const dockerfilePath = resolve(snapshotDir, 'Dockerfile')

console.log(`\n━━━ Snapshot Rebuild ━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`Name:       ${snapshotName}`)
console.log(`Dockerfile: ${dockerfilePath}`)
console.log(`Scaffold:   ${resolve(snapshotDir, 'scaffold')}`)
console.log(`Dry run:    ${dryRun}`)
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

// Create image from Dockerfile with local context (scaffold/, entrypoint.sh, bashrc-extra.sh)
const image = Image.fromDockerfile(dockerfilePath)

if (dryRun) {
  console.log('Generated Dockerfile:')
  console.log('─'.repeat(60))
  console.log(image.dockerfile)
  console.log('─'.repeat(60))
  console.log('\nContext files:')
  for (const ctx of image.contextList) {
    console.log(`  ${ctx.sourcePath} → ${ctx.archivePath}`)
  }
  console.log('\nDry run complete. No snapshot created.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Create snapshot via Daytona SDK
// ---------------------------------------------------------------------------

const daytona = new Daytona()

console.log('Building snapshot (this may take 2-5 minutes)...\n')

const startTime = Date.now()

const snapshot = await daytona.snapshot.create(
  {
    name: snapshotName,
    image,
    resources: {
      cpu: 2,
      memory: 4, // GiB
      disk: 10, // GiB
    },
    entrypoint: ['/entrypoint.sh'],
  },
  {
    onLogs: (chunk: string) => {
      // Stream build logs to stdout
      process.stdout.write(chunk)
    },
    timeout: 600, // 10 minute timeout
  },
)

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

console.log(`\n━━━ Snapshot Created ━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`ID:      ${snapshot.id}`)
console.log(`Name:    ${snapshot.name}`)
console.log(`State:   ${snapshot.state}`)
console.log(`Elapsed: ${elapsed}s`)
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

// ---------------------------------------------------------------------------
// Update .env.local with new snapshot ID
// ---------------------------------------------------------------------------

const envPath = resolve(snapshotDir, '..', '.env.local')
try {
  let envContent = readFileSync(envPath, 'utf-8')
  const oldMatch = envContent.match(/^DAYTONA_SNAPSHOT_ID=(.*)$/m)
  const oldId = oldMatch ? oldMatch[1] : '(not set)'

  if (oldMatch) {
    envContent = envContent.replace(
      /^DAYTONA_SNAPSHOT_ID=.*$/m,
      `DAYTONA_SNAPSHOT_ID=${snapshot.id}`,
    )
  } else {
    envContent += `\nDAYTONA_SNAPSHOT_ID=${snapshot.id}\n`
  }

  writeFileSync(envPath, envContent)
  console.log(`Updated .env.local:`)
  console.log(`  DAYTONA_SNAPSHOT_ID: ${oldId} → ${snapshot.id}`)
} catch {
  console.log(`\nCould not update .env.local automatically.`)
  console.log(`Set manually: DAYTONA_SNAPSHOT_ID=${snapshot.id}`)
}

console.log('\nDone! New sandboxes will use this snapshot.')
