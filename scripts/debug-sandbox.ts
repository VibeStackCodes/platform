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
  console.log('Sandbox:', s.id)

  // Check running processes
  const ps = await s.process.executeCommand('ps aux', '/workspace')
  console.log('\n=== PROCESSES ===')
  console.log(ps.result)

  // Check if files exist
  const ls = await s.process.executeCommand('ls -la /workspace/', '/workspace')
  console.log('\n=== /workspace/ ===')
  console.log(ls.result)

  // Check if bun run dev is running or errored
  const logs = await s.process.executeCommand(
    'cat /tmp/checker-errors.log 2>/dev/null || echo "no log file"',
    '/workspace',
  )
  console.log('\n=== checker-errors.log ===')
  console.log(logs.result)

  // Try curl localhost:3000
  const curl = await s.process.executeCommand(
    'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "FAILED"',
    '/workspace',
  )
  console.log('\n=== curl localhost:3000 ===')
  console.log(curl.result)

  // Check package.json scripts
  const pkg = await s.process.executeCommand(
    'cat /workspace/package.json 2>/dev/null || echo "no package.json"',
    '/workspace',
  )
  console.log('\n=== package.json ===')
  console.log(pkg.result)
}
main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
