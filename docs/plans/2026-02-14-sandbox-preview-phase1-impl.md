# Sandbox Preview Phase 1: Direct Daytona Signed URL

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken HTTP-only Next.js proxy with direct Daytona signed URLs so Vite HMR works natively through WebSocket.

**Architecture:** The iframe loads the sandbox directly via a signed Daytona URL (token embedded in URL, no header needed). The client periodically refreshes the URL before it expires (1 hour TTL). The proxy route is deleted entirely.

**Tech Stack:** Daytona SDK (`getSignedPreviewUrl`), Next.js App Router, React 19

**Design doc:** `docs/plans/2026-02-14-sandbox-preview-architecture-design.md`

---

### Task 1: Update `sandbox-urls` route to return signed Daytona URL

**Files:**
- Modify: `app/api/projects/[id]/sandbox-urls/route.ts`

**Step 1: Update the route to return signed URL + expiresAt**

Replace the route to return the signed Daytona URL directly instead of a same-origin proxy path:

```typescript
/**
 * GET /api/projects/[id]/sandbox-urls
 *
 * Returns sandbox preview + code server URLs.
 * Preview URL is a signed Daytona URL loaded directly in the iframe —
 * supports both HTTP and WebSocket (Vite HMR).
 *
 * TODO: Phase 2 — replace with Cloudflare proxy on *.preview.vibestack.app
 * See docs/plans/2026-02-14-sandbox-preview-architecture-design.md
 */

import { NextRequest, NextResponse } from "next/server";
import { findSandboxByProject, getPreviewUrl, waitForDevServer } from "@/lib/sandbox";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const sandbox = await findSandboxByProject(projectId);
  if (!sandbox) {
    return NextResponse.json({ previewUrl: null, codeServerUrl: null, expiresAt: null });
  }

  try {
    const expiresInSeconds = 3600; // 1 hour

    const [, preview, codeServer] = await Promise.all([
      waitForDevServer(sandbox),
      getPreviewUrl(sandbox, 3000),        // signed URL for preview
      getPreviewUrl(sandbox, 13337),       // signed URL for code server
    ]);

    return NextResponse.json({
      sandboxId: sandbox.id,
      previewUrl: preview.url,
      codeServerUrl: codeServer.url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    });
  } catch {
    return NextResponse.json({ sandboxId: sandbox.id, previewUrl: null, codeServerUrl: null, expiresAt: null });
  }
}
```

**Step 2: Verify route compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep sandbox-urls || echo "No errors"`
Expected: No errors

**Step 3: Commit**

```bash
git add app/api/projects/[id]/sandbox-urls/route.ts
git commit -m "feat(preview): return signed Daytona URL from sandbox-urls endpoint

Replaces same-origin proxy URL with direct signed Daytona URL that
supports WebSocket (Vite HMR). Adds expiresAt for client-side refresh."
```

---

### Task 2: Update `project-layout.tsx` with URL refresh timer

**Files:**
- Modify: `components/project-layout.tsx`

**Step 1: Add URL refresh logic**

Update `project-layout.tsx` to:
1. NOT use `initialPreviewUrl` from DB (it was the old proxy URL, now stale)
2. Always fetch fresh signed URL from `sandbox-urls`
3. Set a refresh timer that fetches a new URL before expiry (at 50 minutes, 10 min before the 1h expiry)
4. On refresh, update the iframe src (Vite will auto-reconnect HMR)

```typescript
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { BuilderChat } from "@/components/builder-chat";
import { BuilderPreview } from "@/components/builder-preview";

interface ProjectLayoutProps {
  projectId: string;
  initialPrompt?: string;
  initialMessages?: Array<{ id: string; role: "user" | "assistant" | "system"; parts: Array<Record<string, unknown>> }>;
  initialSandboxId?: string;
  initialPreviewUrl?: string;
  initialCodeServerUrl?: string;
  initialSupabaseUrl?: string;
  initialSupabaseProjectId?: string;
}

// TODO: Phase 2 — replace polling with *.preview.vibestack.app Cloudflare proxy (no expiry)
// See docs/plans/2026-02-14-sandbox-preview-architecture-design.md
const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000; // refresh 10 min before expiry

export function ProjectLayout({
  projectId,
  initialPrompt,
  initialMessages,
  initialSandboxId,
  initialSupabaseUrl,
  initialSupabaseProjectId,
}: ProjectLayoutProps) {
  const [sandboxId, setSandboxId] = useState(initialSandboxId);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [codeServerUrl, setCodeServerUrl] = useState<string | undefined>();
  const [supabaseUrl, setSupabaseUrl] = useState(initialSupabaseUrl);
  const [supabaseProjectId, setSupabaseProjectId] = useState(initialSupabaseProjectId);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch signed sandbox URLs from the API
  const fetchSandboxUrls = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sandbox-urls`);
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.previewUrl) return false;

      setSandboxId(data.sandboxId);
      setPreviewUrl(data.previewUrl);
      setCodeServerUrl(data.codeServerUrl);

      // Schedule refresh before expiry
      if (data.expiresAt) {
        const expiresAt = new Date(data.expiresAt).getTime();
        const refreshIn = Math.max(expiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS, 60_000);
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => { fetchSandboxUrls(); }, refreshIn);
      }

      return true;
    } catch {
      return false;
    }
  }, [projectId]);

  // Poll for sandbox URLs on mount (sandbox may still be provisioning)
  useEffect(() => {
    if (previewUrl) return; // Already have it

    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 30 && !cancelled; i++) {
        const found = await fetchSandboxUrls();
        if (found || cancelled) return;
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(refreshTimerRef.current);
    };
  }, [projectId, previewUrl, fetchSandboxUrls]);

  // Cleanup refresh timer on unmount
  useEffect(() => {
    return () => { clearTimeout(refreshTimerRef.current); };
  }, []);

  // Supabase realtime for non-sandbox fields (supabase project, etc.)
  useEffect(() => {
    if (supabaseProjectId) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.supabase_url) setSupabaseUrl(row.supabase_url as string);
          if (row.supabase_project_id) setSupabaseProjectId(row.supabase_project_id as string);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, supabaseProjectId]);

  return (
    <div className="flex h-screen">
      <div className="w-2/5 border-r">
        <BuilderChat projectId={projectId} initialPrompt={initialPrompt} initialMessages={initialMessages} />
      </div>
      <div className="w-3/5">
        <BuilderPreview
          projectId={projectId}
          sandboxId={sandboxId}
          previewUrl={previewUrl}
          codeServerUrl={codeServerUrl}
          supabaseUrl={supabaseUrl}
          supabaseProjectId={supabaseProjectId}
        />
      </div>
    </div>
  );
}
```

Key changes from original:
- Removed `initialPreviewUrl` and `initialCodeServerUrl` from destructuring (stale signed URLs from DB are useless)
- `fetchSandboxUrls()` is a reusable callback that fetches + schedules refresh
- Refresh timer fires 10 min before expiry (at ~50 min mark)
- Cleanup on unmount

**Step 2: Verify compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep project-layout || echo "No errors"`
Expected: No errors

**Step 3: Commit**

```bash
git add components/project-layout.tsx
git commit -m "feat(preview): use direct signed URLs with auto-refresh timer

Always fetches fresh signed Daytona URLs from sandbox-urls endpoint.
Schedules refresh 10 min before expiry to maintain uninterrupted preview."
```

---

### Task 3: Update `web-preview.tsx` for cross-origin iframe

**Files:**
- Modify: `components/ai-elements/web-preview.tsx`

**Step 1: Adjust sandbox attribute for cross-origin loading**

The iframe now loads a cross-origin URL (Daytona domain). The `allow-same-origin` sandbox flag is still needed — without it, the iframe's scripts can't even access `localStorage` or make network requests. For cross-origin iframes, `allow-same-origin` means "use the iframe's actual origin" (the Daytona domain), which is safe because it's already a different origin from the platform.

```typescript
// In WebPreviewBody component, update the sandbox attribute:
<iframe
  className={cn("size-full", className)}
  // TODO: Phase 2 — Cloudflare proxy (*.preview.vibestack.app) will make this same-origin
  // See docs/plans/2026-02-14-sandbox-preview-architecture-design.md
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
  src={(src ?? url) || undefined}
  title="Preview"
  {...props}
/>
```

Changes:
- Added `allow-modals` — generated apps may use `alert()`/`confirm()`
- Added TODO comment for Phase 2
- Kept `allow-same-origin` (safe for cross-origin; required for Vite HMR WebSocket)

**Step 2: Commit**

```bash
git add components/ai-elements/web-preview.tsx
git commit -m "feat(preview): adjust iframe sandbox attrs for cross-origin Daytona URL

Add allow-modals for generated apps. Add TODO for Phase 2 Cloudflare upgrade."
```

---

### Task 4: Update `provisionProject()` to stop storing proxy preview URL

**Files:**
- Modify: `lib/sandbox.ts`

**Step 1: Remove preview_url from DB write in provisionProject()**

The signed preview URL expires, so storing it in the DB is wrong — the client always fetches fresh from `sandbox-urls`. Only store `sandbox_id` and `code_server_url`.

In the `provisionProject()` function (~line 566), change:

```typescript
// OLD:
const proxyPreviewUrl = `/api/projects/${projectId}/preview`;
await supabaseClient
  .from('projects')
  .update({
    sandbox_id: sandbox.id,
    preview_url: proxyPreviewUrl,
    code_server_url: codeServerUrl,
    ...(githubRepoUrl ? { github_repo_url: githubRepoUrl } : {}),
  })
  .eq('id', projectId);
```

To:

```typescript
// TODO: Phase 2 — store *.preview.vibestack.app URL (non-expiring Cloudflare proxy)
// See docs/plans/2026-02-14-sandbox-preview-architecture-design.md
await supabaseClient
  .from('projects')
  .update({
    sandbox_id: sandbox.id,
    code_server_url: codeServerUrl,
    ...(githubRepoUrl ? { github_repo_url: githubRepoUrl } : {}),
  })
  .eq('id', projectId);
```

Remove the `proxyPreviewUrl` variable and the `preview_url` field from the update.

**Step 2: Verify compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | grep sandbox || echo "No errors"`
Expected: No errors

**Step 3: Commit**

```bash
git add lib/sandbox.ts
git commit -m "fix(preview): stop storing expiring preview URL in DB

Signed Daytona URLs expire after 1 hour. Client now always fetches
fresh URLs from sandbox-urls endpoint instead of reading stale DB value."
```

---

### Task 5: Delete the preview proxy route

**Files:**
- Delete: `app/api/projects/[id]/preview/[[...path]]/route.ts`

**Step 1: Delete the proxy route file**

```bash
rm app/api/projects/\[id\]/preview/\[\[...path\]\]/route.ts
```

**Step 2: Remove the preview directory if empty**

```bash
rmdir app/api/projects/\[id\]/preview/\[\[...path\]\]
rmdir app/api/projects/\[id\]/preview
```

**Step 3: Check for any remaining references to the proxy path**

Run: `grep -r "/api/projects.*preview" --include="*.ts" --include="*.tsx" -l`
Expected: Only the design doc should remain (no source code references)

**Step 4: Verify build**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(preview): delete HTTP-only proxy route

The proxy could not handle WebSocket upgrades (Vite HMR), causing
broken HMR and 404s for Vite internal modules. Replaced by direct
signed Daytona URLs that support both HTTP and WebSocket natively."
```

---

### Task 6: Update project page to stop passing stale preview URL

**Files:**
- Modify: `app/project/[id]/page.tsx`

**Step 1: Remove `initialPreviewUrl` and `initialCodeServerUrl` from props**

These were the old proxy URLs stored in the DB. The client now fetches fresh signed URLs.

In `app/project/[id]/page.tsx`, change the `ProjectLayout` render (~line 57):

```typescript
return (
  <ProjectLayout
    projectId={id}
    initialPrompt={project.status === "pending" ? project.prompt : undefined}
    initialMessages={initialMessages}
    initialSandboxId={project.sandbox_id}
    initialSupabaseUrl={project.supabase_url}
    initialSupabaseProjectId={project.supabase_project_id}
  />
);
```

Remove `initialPreviewUrl={project.preview_url}` and `initialCodeServerUrl={project.code_server_url}`.

**Step 2: Clean up ProjectLayoutProps interface**

In `components/project-layout.tsx`, remove `initialPreviewUrl` and `initialCodeServerUrl` from the `ProjectLayoutProps` interface (they're no longer used):

```typescript
interface ProjectLayoutProps {
  projectId: string;
  initialPrompt?: string;
  initialMessages?: Array<{ id: string; role: "user" | "assistant" | "system"; parts: Array<Record<string, unknown>> }>;
  initialSandboxId?: string;
  initialSupabaseUrl?: string;
  initialSupabaseProjectId?: string;
}
```

**Step 3: Verify build**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

**Step 4: Commit**

```bash
git add app/project/[id]/page.tsx components/project-layout.tsx
git commit -m "refactor(preview): remove stale preview/code-server URL props

Client always fetches fresh signed URLs from sandbox-urls endpoint.
DB-stored URLs were proxy paths that no longer exist."
```

---

### Task 7: Verify full build and test

**Step 1: Run type check**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

**Step 2: Run linter**

Run: `pnpm lint`
Expected: No errors

**Step 3: Run unit tests**

Run: `pnpm test`
Expected: All tests pass

**Step 4: Run mock E2E tests (if applicable)**

Run: `pnpm test:e2e:mock`
Expected: All tests pass (mock mode doesn't use sandbox URLs)

**Step 5: Final commit (if any lint/type fixes needed)**

```bash
git add -A
git commit -m "chore: fix lint/type issues from preview architecture change"
```
