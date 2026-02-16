#!/usr/bin/env node
// Demo script to show contract-to-trpc output

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Load the TypeScript module using tsx
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const serverDir = join(__dirname, '../server')

// We'll use the compiled version from dist if available, or tsx for dev
try {
  const { contractToTrpc, contractToRootRouter } = await import(
    join(serverDir, 'lib/contract-to-trpc.ts')
  )

  const sampleContract = {
    tables: [
      {
        name: 'bookmark',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          { name: 'url', type: 'text', nullable: false },
          { name: 'title', type: 'text', nullable: true },
          { name: 'description', type: 'text', nullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      },
      {
        name: 'tag',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'text', nullable: false },
          { name: 'color', type: 'text', nullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      },
      {
        name: 'bookmark_tag',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'bookmark_id', type: 'uuid', references: { table: 'bookmark', column: 'id' } },
          { name: 'tag_id', type: 'uuid', references: { table: 'tag', column: 'id' } },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      },
    ],
  }

  console.log('='.repeat(80))
  console.log('DEMO: contract-to-trpc.ts')
  console.log('='.repeat(80))
  console.log()

  const routers = contractToTrpc(sampleContract)

  for (const router of routers) {
    console.log(`File: routers/${router.fileName}`)
    console.log('-'.repeat(80))
    console.log(router.content)
    console.log()
    console.log()
  }

  console.log('File: root-router.ts')
  console.log('-'.repeat(80))
  const rootRouter = contractToRootRouter(sampleContract)
  console.log(rootRouter)
  console.log()
} catch (err) {
  console.error('Error loading module:', err.message)
  console.log('Run with tsx: bun tsx scripts/demo-contract-to-trpc.mjs')
}
