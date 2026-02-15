import { Daytona } from '@daytonaio/sdk'

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY
  if (!apiKey) {
    console.error('DAYTONA_API_KEY required')
    process.exit(1)
  }
  const d = new Daytona({ apiKey, apiUrl: 'https://app.daytona.io/api', _experimental: {} })

  // Delete all existing sandboxes
  const result = await d.list()
  const sandboxes = (result as any).items || result
  for (const s of sandboxes) {
    try {
      console.log(`Deleting sandbox: ${s.id}`)
      await d.delete(s)
    } catch (e: any) {
      console.log(`  Skip: ${e.message?.slice(0, 60)}`)
    }
  }

  // Poll until clear
  console.log('Waiting for cleanup...')
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    const check = await d.list()
    const remaining = (check as any).items || check
    console.log(`  ${remaining.length} remaining...`)
    if (remaining.length === 0) {
      console.log('All clear.')
      return
    }
  }
  console.error('Timed out waiting for cleanup')
  process.exit(1)
}
main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
