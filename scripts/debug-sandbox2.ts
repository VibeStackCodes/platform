import { Daytona } from '@daytonaio/sdk'

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY
  if (!apiKey) {
    console.error('Missing DAYTONA_API_KEY')
    process.exit(1)
  }
  const d = new Daytona({ apiKey, apiUrl: 'https://app.daytona.io/api', _experimental: {} })
  const result = await d.list()
  const sandboxes = (result as { items?: unknown[] }).items || result
  const s = sandboxes[0]
  if (!s) {
    console.error('No sandbox found')
    process.exit(1)
  }

  // Try running bun run dev directly and capture output
  console.log('Running bun run dev (capturing output for 10s)...')
  const r = await s.process.executeCommand(
    'cd /workspace && timeout 10 bun run dev --host 0.0.0.0 2>&1 || true',
    '/workspace',
  )
  console.log('Output:', r.result)

  // Check which bun
  const bun = await s.process.executeCommand('which bun && bun --version', '/workspace')
  console.log('\nbun:', bun.result)

  // Check vite
  const vite = await s.process.executeCommand(
    'ls node_modules/.bin/vite 2>/dev/null && node_modules/.bin/vite --version 2>/dev/null || echo "no vite"',
    '/workspace',
  )
  console.log('\nvite:', vite.result)
}
main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
