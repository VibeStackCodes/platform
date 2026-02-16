import { Daytona } from "@daytonaio/sdk"
const d = new Daytona()
const sb = await d.get("78e3f56f-367a-4b13-80ff-54186060b14e")

// Read the app layout / nav component
const files = [
  'src/components/app-layout.tsx',
  'src/components/AppLayout.tsx',
  'src/components/Layout.tsx',
  'src/components/nav.tsx',
  'src/components/Navbar.tsx',
]

for (const f of files) {
  try {
    const content = (await sb.fs.downloadFile(`/workspace/${f}`)).toString()
    console.log(`\n=== ${f} ===`)
    console.log(content)
  } catch {
    // file doesn't exist
  }
}

// Also check App.tsx for nav/route setup
const app = (await sb.fs.downloadFile('/workspace/src/App.tsx')).toString()
console.log('\n=== src/App.tsx ===')
console.log(app)
