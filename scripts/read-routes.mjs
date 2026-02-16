import { Daytona } from "@daytonaio/sdk"

const d = new Daytona()
const sb = await d.get("78e3f56f-367a-4b13-80ff-54186060b14e")

const routeFiles = [
  'src/routes/index.tsx',
  'src/routes/login.tsx',
  'src/routes/bookmarks.new.tsx',
  'src/routes/bookmarks.$id.tsx',
  'src/routes/tags.tsx',
  'src/components/app-layout.tsx',
  'src/hooks/useBookmarks.ts',
  'src/lib/supabaseClient.ts',
]

for (const f of routeFiles) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`=== /workspace/${f} ===`)
  console.log('='.repeat(60))
  try {
    const content = await sb.fs.downloadFile(`/workspace/${f}`)
    console.log(content.toString())
  } catch (e) {
    console.log(`NOT FOUND: ${e.message?.slice(0, 100)}`)
  }
}
