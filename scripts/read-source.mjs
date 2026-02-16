import { Daytona } from "@daytonaio/sdk"
const d = new Daytona()
const sb = await d.get("78e3f56f-367a-4b13-80ff-54186060b14e")

// Read the tags route (has rename/delete bugs)
const tags = (await sb.fs.downloadFile("/workspace/src/routes/tags.tsx")).toString()
console.log("=== src/routes/tags.tsx ===")
console.log(tags)

// Read the index route to see what the "Back" button links to
const index = (await sb.fs.downloadFile("/workspace/src/routes/index.tsx")).toString()
console.log("\n=== src/routes/index.tsx ===")
console.log(index)

// Check if there's a prompt or generation log stored somewhere
try {
  const r = await sb.process.executeCommand("find /workspace -name '*.prompt' -o -name 'generation.log' -o -name 'requirements.txt' -o -name 'prompt.txt' 2>/dev/null | head -5", "/workspace")
  console.log("\n=== Prompt files ===")
  console.log(r.result || "none found")
} catch {}
