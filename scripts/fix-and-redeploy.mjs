import { Daytona } from "@daytonaio/sdk"
import { getInstallationToken } from "../server/lib/github.ts"

const SANDBOX_ID = "78e3f56f-367a-4b13-80ff-54186060b14e"
const GITHUB_CLONE_URL = "https://github.com/VibeStackCodes-Generated/vibestack-4d4407de-07f2-4279-be60-93fa809726d1.git"

const d = new Daytona()
const sb = await d.get(SANDBOX_ID)

async function upload(path, content) {
  await sb.fs.uploadFile(Buffer.from(content), `/workspace/${path}`)
  console.log(`  Wrote ${path}`)
}

async function run(cmd, label, timeout = 60) {
  console.log(`\n[${label}] ${cmd}`)
  const r = await sb.process.executeCommand(cmd, "/workspace", undefined, timeout)
  if (r.exitCode !== 0) {
    console.error(`[${label}] FAILED (exit ${r.exitCode}):`)
    console.error(r.result.slice(0, 1000))
    return false
  }
  console.log(`[${label}] OK`)
  if (r.result.trim()) console.log(r.result.slice(0, 500))
  return true
}

console.log("=== STEP 1: Fix files ===\n")

// 1. Fix index.html
await upload("index.html", `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MarkNest</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`)

// 2. Fix App.tsx — proper router with all routes
await upload("src/App.tsx", `import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"

import { AppLayout } from "@/components/app-layout"
import IndexRoute from "@/routes/index"
import LoginRoute from "@/routes/login"
import NewBookmarkRoute from "@/routes/bookmarks.new"
import BookmarkDetailsRoute from "@/routes/bookmarks.$id"
import TagsRoute from "@/routes/tags"

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

const rootRoute = createRootRoute({ component: AppLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexRoute,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginRoute,
})

const newBookmarkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bookmarks/new",
  component: NewBookmarkRoute,
})

const bookmarkDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bookmarks/$id",
  component: BookmarkDetailsRoute,
})

const tagsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tags",
  component: TagsRoute,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  newBookmarkRoute,
  bookmarkDetailRoute,
  tagsRoute,
])

const router = createRouter({ routeTree })

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
`)

// 3. Fix login.tsx import — @/lib/supabase → @/lib/supabaseClient
const loginContent = (await sb.fs.downloadFile("/workspace/src/routes/login.tsx")).toString()
const fixedLogin = loginContent.replace(
  'from "@/lib/supabase"',
  'from "@/lib/supabaseClient"'
)
await upload("src/routes/login.tsx", fixedLogin)

// 4. Create missing hook files (thin wrappers around existing code)
// useBookmark (singular) — fetches a single bookmark by id
await upload("src/hooks/useBookmark.ts", `import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export function useBookmark({ id }: { id: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)

  const refetch = async () => {
    setIsLoading(true)
    setIsError(false)
    try {
      const { data: row, error: err } = await supabase
        .from("bookmark")
        .select("*, bookmark_tag(tag(*))")
        .eq("id", id)
        .single()
      if (err) throw err
      const tags = ((row as any)?.bookmark_tag ?? []).map((bt: any) => bt.tag).filter(Boolean)
      setData({ ...row, tags })
    } catch (e) {
      setError(e)
      setIsError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { if (id) refetch() }, [id])
  return { data, error, isLoading, isError, refetch }
}
`)

// useCreateBookmark
await upload("src/hooks/useCreateBookmark.ts", `import { useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export function useCreateBookmark() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [isError, setIsError] = useState(false)

  const mutateAsync = async (input: {
    title: string | null
    url: string
    description: string | null
    is_starred: boolean
    tagIds: string[]
  }) => {
    setIsPending(true)
    setIsError(false)
    try {
      const { data, error: err } = await supabase
        .from("bookmark")
        .insert({ title: input.title, url: input.url, description: input.description, is_starred: input.is_starred })
        .select()
        .single()
      if (err) throw err
      if (input.tagIds.length > 0 && data?.id) {
        const rows = input.tagIds.map(tagId => ({ bookmark_id: data.id, tag_id: tagId }))
        await supabase.from("bookmark_tag").insert(rows)
      }
      return data
    } catch (e) {
      setError(e)
      setIsError(true)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  return { mutateAsync, isPending, error, isError }
}
`)

// useUpdateBookmark
await upload("src/hooks/useUpdateBookmark.ts", `import { useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export function useUpdateBookmark() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [isError, setIsError] = useState(false)

  const mutateAsync = async (input: {
    id: string
    title: string | null
    url: string
    description: string | null
    is_starred: boolean
    tagIds: string[]
  }) => {
    setIsPending(true)
    setIsError(false)
    try {
      const { error: err } = await supabase
        .from("bookmark")
        .update({ title: input.title, url: input.url, description: input.description, is_starred: input.is_starred })
        .eq("id", input.id)
      if (err) throw err
      await supabase.from("bookmark_tag").delete().eq("bookmark_id", input.id)
      if (input.tagIds.length > 0) {
        const rows = input.tagIds.map(tagId => ({ bookmark_id: input.id, tag_id: tagId }))
        await supabase.from("bookmark_tag").insert(rows)
      }
    } catch (e) {
      setError(e)
      setIsError(true)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  return { mutateAsync, isPending, error, isError }
}
`)

// useDeleteBookmark
await upload("src/hooks/useDeleteBookmark.ts", `import { useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export function useDeleteBookmark() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [isError, setIsError] = useState(false)

  const mutateAsync = async (input: { id: string }) => {
    setIsPending(true)
    setIsError(false)
    try {
      const { error: err } = await supabase.from("bookmark").delete().eq("id", input.id)
      if (err) throw err
    } catch (e) {
      setError(e)
      setIsError(true)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  return { mutateAsync, isPending, error, isError }
}
`)

// useCreateTag
await upload("src/hooks/useCreateTag.ts", `import { useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export function useCreateTag() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [isError, setIsError] = useState(false)

  const mutateAsync = async (input: { name: string }) => {
    setIsPending(true)
    setIsError(false)
    try {
      const { data, error: err } = await supabase.from("tag").insert({ name: input.name }).select().single()
      if (err) throw err
      return data
    } catch (e) {
      setError(e)
      setIsError(true)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  return { mutateAsync, isPending, error, isError }
}
`)

// useDeleteTag
await upload("src/hooks/useDeleteTag.ts", `import { useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export function useDeleteTag() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [isError, setIsError] = useState(false)

  const mutateAsync = async (input: { id: string }) => {
    setIsPending(true)
    setIsError(false)
    try {
      const { error: err } = await supabase.from("tag").delete().eq("id", input.id)
      if (err) throw err
    } catch (e) {
      setError(e)
      setIsError(true)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  return { mutateAsync, isPending, error, isError }
}
`)

// useRenameTag
await upload("src/hooks/useRenameTag.ts", `import { useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export function useRenameTag() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [isError, setIsError] = useState(false)

  const mutateAsync = async (input: { id: string; name: string }) => {
    setIsPending(true)
    setIsError(false)
    try {
      const { error: err } = await supabase.from("tag").update({ name: input.name }).eq("id", input.id)
      if (err) throw err
    } catch (e) {
      setError(e)
      setIsError(true)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  return { mutateAsync, isPending, error, isError }
}
`)

// 5. Add vercel.json for SPA routing
await upload("vercel.json", `{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
`)

// 6. Add .gitignore
await upload(".gitignore", `node_modules/
dist/
.vite/
*.local
.env
.env.*
`)

// 7. Add .env with Supabase credentials
await upload(".env", `VITE_SUPABASE_URL=https://xniyqipanlelneyigrbn.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuaXlxaXBhbmxlbG5leWlncmJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMzUzMDIsImV4cCI6MjA4NjgxMTMwMn0.placeholder
`)

// 8. Install react-hook-form (routes use it but it may not be in package.json)
console.log("\n=== STEP 2: Install missing deps ===\n")
await run("bun add @tanstack/react-query react-hook-form", "install-deps", 60)

// 9. Build
console.log("\n=== STEP 3: Build ===\n")
void await run("tsc --noEmit 2>&1 || true", "tsc", 60)
const buildOk = await run("bun run build", "build", 120)

if (!buildOk) {
  console.error("\nBuild failed — checking errors...")
  process.exit(1)
}

// 10. Git commit + push
console.log("\n=== STEP 4: Git commit + push ===\n")

// Remove node_modules from git tracking
await run("echo 'node_modules/' >> .gitignore && git rm -r --cached node_modules 2>/dev/null || true", "git-rm-nodemodules", 120)
await run("git add -A", "git-add")
await run("git commit -m 'fix: wire App.tsx routing, add missing hooks, vercel.json, .gitignore'", "git-commit")

const token = await getInstallationToken()
// Update remote URL with fresh token
await run("git remote remove origin 2>/dev/null || true", "remove-remote")
const authUrl = GITHUB_CLONE_URL.replace("https://", `https://x-access-token:${token}@`)
await run(`git remote add origin ${authUrl}`, "add-remote")
await run("git push -f origin main", "git-push", 60)

console.log("\n=== STEP 5: Trigger Vercel redeploy ===\n")

const vercelToken = process.env.VERCEL_TOKEN
const resp = await fetch("https://api.vercel.com/v13/deployments", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${vercelToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "marknest",
    gitSource: {
      type: "github",
      org: "VibeStackCodes-Generated",
      repo: "vibestack-4d4407de-07f2-4279-be60-93fa809726d1",
      ref: "main",
    },
    projectSettings: {
      framework: "vite",
      buildCommand: "bun run build",
      installCommand: "bun install",
      outputDirectory: "dist",
    },
    target: "production",
  }),
})

const deploy = await resp.json()
if (!resp.ok) {
  console.error("Deploy failed:", JSON.stringify(deploy, null, 2))
  process.exit(1)
}

console.log(`Deployment URL: https://${deploy.url}`)
console.log(`Deployment ID: ${deploy.id}`)
console.log(`Status: ${deploy.readyState}`)
console.log("\nDone! Wait ~30s for build to complete, then visit https://marknest-tau.vercel.app")
