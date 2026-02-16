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

// ── Fix 1: Rewrite app-layout.tsx with correct nav links ──
console.log("=== Fix 1: Rewrite app-layout.tsx ===\n")

await upload("src/components/app-layout.tsx", `import { Link, Outlet } from "@tanstack/react-router"

const navLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/bookmarks/new", label: "New Bookmark" },
  { to: "/tags", label: "Tags" },
  { to: "/login", label: "Sign In" },
]

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <nav className="container mx-auto flex items-center gap-6 py-4">
          <Link to="/" className="text-lg font-bold">
            MarkNest
          </Link>
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-sm text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="container mx-auto py-6">
        <Outlet />
      </main>
    </div>
  )
}
`)

// ── Build ──
console.log("\n=== Building ===\n")
const buildOk = await run("bun run build", "build", 120)
if (!buildOk) {
  process.exit(1)
}

// ── Git commit + push ──
console.log("\n=== Git commit + push ===\n")
await run("git add -A", "git-add")
await run("git commit -m 'fix: correct nav links to use app routes instead of table names'", "git-commit")

const token = await getInstallationToken()
await run("git remote remove origin 2>/dev/null || true", "rm-remote")
const authUrl = GITHUB_CLONE_URL.replace("https://", `https://x-access-token:${token}@`)
await run(`git remote add origin ${authUrl}`, "add-remote")
await run("git push origin main", "git-push", 60)

// ── Redeploy ──
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
if (!resp.ok) {
  console.error("Deploy error:", JSON.stringify(deploy).slice(0, 500))
  process.exit(1)
}
console.log(`Deployment: https://${deploy.url}`)
console.log(`ID: ${deploy.id}`)
console.log(`\nhttps://marknest-tau.vercel.app (wait ~30s)`)
