#!/usr/bin/env bun
/**
 * Seed the warm Supabase project pool.
 *
 * Usage:
 *   bun scripts/seed-warm-pool.ts          # Default: 3 projects
 *   bun scripts/seed-warm-pool.ts 5        # Custom target size
 *   bun scripts/seed-warm-pool.ts status   # Show pool status
 */

import { replenishPool, getPoolStatus } from '../server/lib/supabase-pool'

const arg = process.argv[2]

if (arg === 'status') {
  const status = await getPoolStatus()
  console.log(`Pool status: ${status.available} available, ${status.claimed} claimed, ${status.total} total`)
  process.exit(0)
}

const target = arg ? Number.parseInt(arg, 10) : 3

console.log(`Seeding warm pool with target size ${target}...`)
console.log('Each project takes ~90-130s to provision.\n')

const start = Date.now()
const result = await replenishPool(target)
const elapsed = ((Date.now() - start) / 1000).toFixed(1)

console.log(`\nDone in ${elapsed}s: created ${result.created}, errors: ${result.errors.length}`)
if (result.errors.length > 0) {
  for (const err of result.errors) {
    console.error(`  - ${err}`)
  }
}

const status = await getPoolStatus()
console.log(`Pool status: ${status.available} available, ${status.claimed} claimed, ${status.total} total`)

process.exit(result.errors.length > 0 ? 1 : 0)
