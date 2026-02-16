import { Daytona } from "@daytonaio/sdk"

const d = new Daytona()
const sb = await d.get("78e3f56f-367a-4b13-80ff-54186060b14e")

const files = ['index.html', 'package.json', 'vite.config.ts', 'vercel.json', 'src/main.tsx', 'src/App.tsx']
for (const f of files) {
  console.log(`\n=== /workspace/${f} ===`)
  try {
    const content = await sb.fs.downloadFile(`/workspace/${f}`)
    console.log(content.toString().slice(0, 800))
  } catch (e) {
    console.log(`NOT FOUND: ${e.message?.slice(0, 100)}`)
  }
}

console.log('\n=== /workspace/dist/index.html ===')
try {
  const dist = await sb.fs.downloadFile('/workspace/dist/index.html')
  console.log(dist.toString())
} catch (e) {
  console.log(`NOT FOUND: ${e.message?.slice(0, 100)}`)
}
