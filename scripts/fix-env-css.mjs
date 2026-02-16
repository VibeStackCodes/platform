import { Daytona } from "@daytonaio/sdk"
import { getInstallationToken } from "../server/lib/github.ts"

const SANDBOX_ID = "78e3f56f-367a-4b13-80ff-54186060b14e"
const GITHUB_CLONE_URL = "https://github.com/VibeStackCodes-Generated/vibestack-4d4407de-07f2-4279-be60-93fa809726d1.git"
const SUPABASE_PROJECT_REF = "xniyqipanlelneyigrbn"

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
  if (r.result.trim()) console.log(r.result.slice(0, 500))
  return true
}

// ── Step 1: Get real Supabase anon key ──
console.log("=== Step 1: Get Supabase anon key ===\n")

const supabaseToken = process.env.SUPABASE_ACCESS_TOKEN
const apiKeysResp = await fetch(
  `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys`,
  { headers: { Authorization: `Bearer ${supabaseToken}` } }
)
const apiKeys = await apiKeysResp.json()
const anonKey = apiKeys.find(k => k.name === "anon")?.api_key
console.log("Anon key found:", !!anonKey)
console.log("Anon key prefix:", anonKey?.slice(0, 30) + "...")

const SUPABASE_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`

// ── Step 2: Fix index.css with proper Tailwind v4 theme ──
console.log("\n=== Step 2: Fix CSS theme ===\n")

// Read current index.css
const currentCss = (await sb.fs.downloadFile("/workspace/src/index.css")).toString()
console.log("Current index.css (first 300 chars):", currentCss.slice(0, 300))

// Write a proper shadcn/ui compatible index.css with Tailwind v4
await upload("src/index.css", `@import "tailwindcss";

@theme inline {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.145 0 0);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.145 0 0);
  --color-popover: oklch(1 0 0);
  --color-popover-foreground: oklch(0.145 0 0);
  --color-primary: oklch(0.205 0 0);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-secondary: oklch(0.965 0 0);
  --color-secondary-foreground: oklch(0.205 0 0);
  --color-muted: oklch(0.965 0 0);
  --color-muted-foreground: oklch(0.556 0 0);
  --color-accent: oklch(0.965 0 0);
  --color-accent-foreground: oklch(0.205 0 0);
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-destructive-foreground: oklch(0.577 0.245 27.325);
  --color-border: oklch(0.922 0 0);
  --color-input: oklch(0.922 0 0);
  --color-ring: oklch(0.708 0 0);
  --radius: 0.625rem;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}

@layer base {
  *,
  *::before,
  *::after {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
`)

// ── Step 3: Fix supabaseClient.ts with real credentials hardcoded ──
// (Since Vercel doesn't read .env from repo, hardcode the values for this demo)
console.log("\n=== Step 3: Fix Supabase client ===\n")

await upload("src/lib/supabaseClient.ts", `import type { Database } from "@/lib/dbTypes"
import { type SupabaseClient, createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "${SUPABASE_URL}"
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "${anonKey}"

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
`)

// Also fix the login.tsx import that references @/lib/supabase (might have been re-overwritten)
const loginContent = (await sb.fs.downloadFile("/workspace/src/routes/login.tsx")).toString()
if (loginContent.includes('from "@/lib/supabase"')) {
  const fixed = loginContent.replace('from "@/lib/supabase"', 'from "@/lib/supabaseClient"')
  await upload("src/routes/login.tsx", fixed)
}

// ── Step 4: Set Vercel env vars via API ──
console.log("\n=== Step 4: Set Vercel env vars ===\n")

const vercelToken = process.env.VERCEL_TOKEN

// First, find the project ID
const projectsResp = await fetch("https://api.vercel.com/v9/projects?search=marknest", {
  headers: { Authorization: `Bearer ${vercelToken}` }
})
const projectsData = await projectsResp.json()
const project = projectsData.projects?.find(p => p.name === "marknest")
console.log("Vercel project:", project?.id, project?.name)

if (project) {
  // Set env vars
  const envVars = [
    { key: "VITE_SUPABASE_URL", value: SUPABASE_URL, target: ["production", "preview", "development"], type: "plain" },
    { key: "VITE_SUPABASE_ANON_KEY", value: anonKey, target: ["production", "preview", "development"], type: "plain" },
  ]

  for (const env of envVars) {
    // Try to create, if exists update
    const createResp = await fetch(`https://api.vercel.com/v10/projects/${project.id}/env`, {
      method: "POST",
      headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(env),
    })
    const createResult = await createResp.json()
    if (createResp.ok) {
      console.log(`  Set ${env.key}: OK`)
    } else if (createResult.error?.code === "ENV_ALREADY_EXISTS") {
      // Patch existing
      const listResp = await fetch(`https://api.vercel.com/v10/projects/${project.id}/env`, {
        headers: { Authorization: `Bearer ${vercelToken}` }
      })
      const listData = await listResp.json()
      const existing = listData.envs?.find(e => e.key === env.key)
      if (existing) {
        await fetch(`https://api.vercel.com/v10/projects/${project.id}/env/${existing.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ value: env.value, target: env.target, type: env.type }),
        })
        console.log(`  Updated ${env.key}: OK`)
      }
    } else {
      console.log(`  ${env.key} error:`, createResult.error?.message || JSON.stringify(createResult).slice(0, 200))
    }
  }
}

// ── Step 5: Build ──
console.log("\n=== Step 5: Build ===\n")
const buildOk = await run("bun run build", "build", 120)
if (!buildOk) {
  process.exit(1)
}

// ── Step 6: Commit + push ──
console.log("\n=== Step 6: Git push ===\n")
await run("git add -A", "git-add")
await run("git commit -m 'fix: add Tailwind theme CSS, hardcode Supabase credentials'", "git-commit")

const ghToken = await getInstallationToken()
await run("git remote remove origin 2>/dev/null || true", "rm-remote")
const authUrl = GITHUB_CLONE_URL.replace("https://", `https://x-access-token:${ghToken}@`)
await run(`git remote add origin ${authUrl}`, "add-remote")
await run("git push origin main", "git-push", 60)

// ── Step 7: Redeploy ──
console.log("\n=== Step 7: Redeploy ===\n")
const deployResp = await fetch("https://api.vercel.com/v13/deployments", {
  method: "POST",
  headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "marknest",
    gitSource: { type: "github", org: "VibeStackCodes-Generated", repo: "vibestack-4d4407de-07f2-4279-be60-93fa809726d1", ref: "main" },
    projectSettings: { framework: "vite", buildCommand: "bun run build", installCommand: "bun install", outputDirectory: "dist" },
    target: "production",
  }),
})
const deploy = await deployResp.json()
if (!deployResp.ok) {
  console.error("Deploy error:", JSON.stringify(deploy).slice(0, 500))
  process.exit(1)
}
console.log(`Deployment: https://${deploy.url}`)
console.log(`ID: ${deploy.id}`)
console.log(`\nhttps://marknest-tau.vercel.app (wait ~30s)`)
