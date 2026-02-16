import { Daytona } from "@daytonaio/sdk"
import { getInstallationToken } from "../server/lib/github.ts"

const SANDBOX_ID = "78e3f56f-367a-4b13-80ff-54186060b14e"
const GITHUB_CLONE_URL = "https://github.com/VibeStackCodes-Generated/vibestack-4d4407de-07f2-4279-be60-93fa809726d1.git"

const d = new Daytona()
const sb = await d.get(SANDBOX_ID)

async function upload(path, content) {
  await sb.fs.uploadFile(Buffer.from(content), `/workspace/${path}`)
  console.log(`  + ${path}`)
}

async function run(cmd, label, timeout = 60) {
  console.log(`\n[${label}] ${cmd}`)
  const r = await sb.process.executeCommand(cmd, "/workspace", undefined, timeout)
  if (r.exitCode !== 0) {
    console.error(`[${label}] FAILED (exit ${r.exitCode}):`)
    console.error(r.result.slice(0, 2000))
    return false
  }
  console.log(`[${label}] OK`)
  if (r.result.trim()) console.log(r.result.slice(0, 300))
  return true
}

console.log("=== Fixing hooks to use proper ESM imports ===\n")

// Rewrite useBookmarks.ts — proper ESM imports, no require() hack
await upload("src/hooks/useBookmarks.ts", `import { useQuery } from "@tanstack/react-query"
import * as bookmarksApi from "@/lib/bookmarks"

export function useBookmarks(params?: { query?: string; starredOnly?: boolean; tagId?: string }) {
  return useQuery({
    queryKey: ["bookmarks", "list", params ?? null],
    queryFn: () => bookmarksApi.listBookmarks(params as never),
  })
}
`)

// Rewrite useTags.ts — proper ESM imports
await upload("src/hooks/useTags.ts", `import { useQuery } from "@tanstack/react-query"
import * as tagsApi from "@/lib/tags"

export function useTags() {
  return useQuery({
    queryKey: ["tags", "list"],
    queryFn: () => tagsApi.listTags(),
  })
}
`)

// Check what listBookmarks/listTags signatures look like
const bookmarksLib = (await sb.fs.downloadFile("/workspace/src/lib/bookmarks.ts")).toString()
console.log("\n=== bookmarks.ts exports ===")
const exportLines = bookmarksLib.split("\n").filter(l => l.includes("export"))
for (const l of exportLines) console.log("  " + l.trim())

const tagsLib = (await sb.fs.downloadFile("/workspace/src/lib/tags.ts")).toString()
console.log("\n=== tags.ts exports ===")
const tagExports = tagsLib.split("\n").filter(l => l.includes("export"))
for (const l of tagExports) console.log("  " + l.trim())

// Build
console.log("\n=== Building ===\n")
const buildOk = await run("bun run build", "build", 120)
if (!buildOk) {
  console.error("Build failed!")
  process.exit(1)
}

// Git commit + push
console.log("\n=== Git commit + push ===\n")
await run("git add -A", "git-add")
await run("git commit -m 'fix: use proper ESM imports in hooks (no require())'", "git-commit")

const token = await getInstallationToken()
await run("git remote remove origin 2>/dev/null || true", "rm-remote")
const authUrl = GITHUB_CLONE_URL.replace("https://", `https://x-access-token:${token}@`)
await run(`git remote add origin ${authUrl}`, "add-remote")
await run("git push origin main", "git-push", 60)

// Redeploy
console.log("\n=== Redeploying ===\n")
const vercelToken = process.env.VERCEL_TOKEN
const resp = await fetch("https://api.vercel.com/v13/deployments", {
  method: "POST",
  headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "marknest",
    gitSource: { type: "github", org: "VibeStackCodes-Generated", repo: "vibestack-4d4407de-07f2-4279-be60-93fa809726d1", ref: "main" },
    projectSettings: { framework: "vite", buildCommand: "bun run build", installCommand: "bun install", outputDirectory: "dist" },
    target: "production",
  }),
})
const deploy = await resp.json()
console.log(`Deployment: https://${deploy.url}`)
console.log(`ID: ${deploy.id}`)
console.log(`\nhttps://marknest-tau.vercel.app (wait ~30s)`)
