# Fast Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce generation-to-preview from ~10 minutes to ~60 seconds.

**Architecture:** Bake Supabase services into the Daytona snapshot so databases are instant. Start the Vite HMR dev server before writing feature files so users see the app build in real-time. Replace full `bun run build` verification with `tsc --noEmit`. Deploy pre-built artifacts to Vercel instead of triggering a rebuild.

**Tech Stack:** Daytona SDK, Postgres 16, Supabase self-hosted (GoTrue + PostgREST), Vite HMR, TypeScript compiler API, Vercel Build Output API.

**Design Doc:** `docs/plans/2026-02-13-fast-pipeline-design.md`

---

## Task 1: Replace Build Verification with tsc --noEmit

The quickest win — no infra changes needed.

**Files:**
- Modify: `lib/verifier.ts:410-430` (the `runBuild` function)
- Test: Manual — run E2E test and measure build verification time

**Step 1: Change `runBuild` to use `tsc --noEmit` instead of `bun run build`**

In `lib/verifier.ts`, find the `runBuild` function (line ~410):

```typescript
async function runBuild(sandbox: Sandbox): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  try {
    const result = await runCommand(
      sandbox,
      'tsc --noEmit',  // Was: 'bun run build'
      'build-verify',
      { cwd: '/workspace', timeout: 60 }  // Was: timeout: 120
    );

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: error instanceof Error ? error.message : String(error),
    };
  }
}
```

Key changes:
- `bun run build` → `tsc --noEmit` (type-check only, no bundling)
- `timeout: 120` → `timeout: 60` (tsc is much faster)

**Step 2: Run tests to verify it passes**

Run: `npx tsc --noEmit` (local type-check)
Expected: PASS (no type errors in the platform itself)

**Step 3: Commit**

```bash
git add lib/verifier.ts
git commit -m "perf: use tsc --noEmit for build verification (5-10x faster)"
```

---

## Task 2: Restructure Template Pipeline for Early HMR

Split the pipeline into phases: scaffold → dev server → feature files. The dev server starts before feature files are written.

**Files:**
- Modify: `lib/template-pipeline.ts` (major restructure)
- Modify: `app/api/projects/generate/route.ts:142-202` (reorder stages)
- Modify: `lib/sandbox.ts` (add `startDevServer` helper)

**Step 1: Add `startDevServer` function to `lib/sandbox.ts`**

Add after the `initGeneratedApp` function (~line 260):

```typescript
/**
 * Start the Vite dev server in the background.
 * Returns preview URL immediately — HMR will pick up file changes.
 */
export async function startDevServer(
  sandbox: Sandbox,
  workDir: string = '/workspace'
): Promise<PreviewUrlResult> {
  // Start dev server in background (async mode)
  await runCommand(
    sandbox,
    'bun run dev',
    'dev-server',
    { cwd: workDir, async: true, timeout: 0 }
  );

  // Wait for server to be ready
  await waitForServerReady(sandbox, 3000, 30);

  // Get preview URL
  return getPreviewUrl(sandbox, 3000);
}
```

**Step 2: Split `runPipeline` into two phases**

Rewrite `lib/template-pipeline.ts`:

```typescript
import type { Sandbox } from '@daytonaio/sdk';
import type { ChatPlan, StreamEvent, GeneratedFile } from './types';
import { classifyFeatures } from './feature-classifier';
import { executeTemplate, groupByLayer } from './template-registry';
import { uploadFile, runCommand } from './sandbox';
import { installShadcnComponents } from './shadcn-installer';

const LAYER_LABELS: Record<number, string> = {
  0: 'scaffold and config',
  1: 'auth and data models',
  2: 'features and UI',
};

/**
 * Phase 1: Write scaffold files + install deps.
 * Returns scaffold files so the caller can start the dev server before Phase 2.
 */
export async function runScaffoldPhase(
  chatPlan: ChatPlan,
  sandbox: Sandbox,
  emit: (event: StreamEvent) => void
): Promise<{ scaffoldFiles: GeneratedFile[]; featureFiles: GeneratedFile[]; allDeps: Record<string, string>; allMigrations: string[] }> {
  const tasks = classifyFeatures(chatPlan.features);
  console.log(`[pipeline] Classified ${chatPlan.features.length} features → ${tasks.length} template tasks`);

  const allFiles: GeneratedFile[] = [];
  const allMigrations: string[] = [];
  const allDeps: Record<string, string> = {};
  const layerGroups = groupByLayer(tasks);

  // Execute ALL templates (fast — no I/O, just Handlebars rendering)
  for (let layerIdx = 0; layerIdx < layerGroups.length; layerIdx++) {
    const layerTasks = layerGroups[layerIdx];
    const results = await Promise.all(
      layerTasks.map(task => executeTemplate(task, chatPlan.designTokens))
    );
    for (const result of results) {
      allFiles.push(...result.files);
      if (result.migration) allMigrations.push(result.migration);
      Object.assign(allDeps, result.dependencies);
    }
  }

  // Install shadcn components
  if (chatPlan.shadcnComponents && chatPlan.shadcnComponents.length > 0) {
    const shadcn = installShadcnComponents(chatPlan.shadcnComponents);
    allFiles.push(...shadcn.files);
    Object.assign(allDeps, shadcn.deps);
  }

  // Add migration file
  if (allMigrations.length > 0) {
    allFiles.push({
      path: 'supabase/migrations/001_init.sql',
      content: allMigrations.join('\n\n-- ---\n\n'),
      layer: 0,
    });
  }

  // Split: layer 0 = scaffold, layers 1+ = features
  const scaffoldFiles = allFiles.filter(f => f.layer === 0);
  const featureFiles = allFiles.filter(f => f.layer !== 0);

  // Write scaffold files
  emit({ type: 'checkpoint', label: 'Layer 0: scaffold and config', status: 'active' });
  for (const file of scaffoldFiles) {
    await uploadFile(sandbox, file.content, `/workspace/${file.path}`);
    emit({ type: 'file_start', path: file.path, layer: file.layer });
    emit({ type: 'file_complete', path: file.path, linesOfCode: file.content.split('\n').length });
  }
  emit({ type: 'checkpoint', label: 'Layer 0: scaffold and config', status: 'complete' });

  // Install dependencies
  if (Object.keys(allDeps).length > 0) {
    emit({ type: 'checkpoint', label: 'Installing dependencies', status: 'active' });
    const depsList = Object.entries(allDeps).map(([pkg, ver]) => `${pkg}@${ver}`).join(' ');
    await runCommand(sandbox, `cd /workspace && bun install ${depsList}`, 'bun-install', { cwd: '/workspace', timeout: 120 });
    emit({ type: 'checkpoint', label: 'Installing dependencies', status: 'complete' });
  }

  return { scaffoldFiles, featureFiles, allDeps, allMigrations };
}

/**
 * Phase 2: Write feature files (each triggers HMR).
 * Called AFTER dev server is running.
 */
export async function runFeaturePhase(
  featureFiles: GeneratedFile[],
  scaffoldFiles: GeneratedFile[],
  sandbox: Sandbox,
  emit: (event: StreamEvent) => void
): Promise<Map<string, string>> {
  const generatedContents = new Map<string, string>();

  // Add scaffold files to contents map
  for (const file of scaffoldFiles) {
    generatedContents.set(file.path, file.content);
  }

  // Write feature files one by one (each triggers HMR)
  emit({ type: 'stage_update', stage: 'generating' });
  for (const file of featureFiles) {
    emit({ type: 'file_start', path: file.path, layer: file.layer });
    await uploadFile(sandbox, file.content, `/workspace/${file.path}`);
    generatedContents.set(file.path, file.content);
    const linesOfCode = file.content.split('\n').length;
    emit({ type: 'file_chunk', path: file.path, chunk: file.content });
    emit({ type: 'file_complete', path: file.path, linesOfCode });
    console.log(`[pipeline] ✓ ${file.path} (${linesOfCode} lines)`);
  }

  // Git commit
  await runCommand(
    sandbox,
    'git init && git config user.email "vibestack@generated.app" && git config user.name "VibeStack"',
    'git-init',
    { cwd: '/workspace', timeout: 30 }
  );
  await sandbox.git.add('/workspace', ['.']);
  const commitResponse = await sandbox.git.commit(
    '/workspace',
    'feat: generate app from templates',
    'VibeStack',
    'vibestack@generated.app',
  );
  const hash = commitResponse.sha?.slice(0, 7) || 'unknown';
  emit({
    type: 'layer_commit',
    layer: 0,
    hash,
    message: 'feat: generate app from templates',
    files: [...scaffoldFiles, ...featureFiles].map(f => f.path),
  });

  console.log(`[pipeline] ✓ Pipeline complete: ${scaffoldFiles.length + featureFiles.length} files`);
  return generatedContents;
}
```

**Step 3: Update generate route to use the two-phase pipeline**

In `app/api/projects/generate/route.ts`, replace the single `runPipeline` call (line 142-144) and subsequent stages with:

```typescript
        // Stage 2: Scaffold Phase (write scaffold + install deps)
        emit({ type: "stage_update", stage: "generating" });
        const { scaffoldFiles, featureFiles } = await runScaffoldPhase(chatPlan, sandbox, emit);

        // Stage 2.5: Start HMR dev server + emit preview URL
        emit({ type: 'checkpoint', label: 'Starting dev server', status: 'active' });
        const { startDevServer } = await import("@/lib/sandbox");
        const previewUrl = await startDevServer(sandbox);
        emit({ type: "preview_ready", url: previewUrl.url });
        emit({ type: 'checkpoint', label: 'Starting dev server', status: 'complete' });

        // Stage 3: Feature Phase (each file triggers HMR — user sees live preview)
        const generatedFiles = await runFeaturePhase(featureFiles, scaffoldFiles, sandbox, emit);

        // Stage 4: Type-check verification
        emit({ type: "stage_update", stage: "verifying_build" });
        // ... rest of pipeline unchanged
```

Also update the preview URL section (Stage 5) since preview is now available earlier — remove the duplicate `getPreviewUrl` call and use the one from Stage 2.5.

**Step 4: Update imports in generate route**

Replace:
```typescript
import { runPipeline } from "@/lib/template-pipeline";
```
With:
```typescript
import { runScaffoldPhase, runFeaturePhase } from "@/lib/template-pipeline";
```

**Step 5: Commit**

```bash
git add lib/template-pipeline.ts lib/sandbox.ts app/api/projects/generate/route.ts
git commit -m "perf: two-phase pipeline with early HMR dev server"
```

---

## Task 3: Bake Supabase Services into Daytona Snapshot

This requires creating a new Daytona snapshot image with Postgres + GoTrue pre-installed and running.

**Files:**
- Create: `snapshot/Dockerfile` (Daytona snapshot definition)
- Create: `snapshot/supabase-init.sh` (startup script for Supabase services)
- Create: `snapshot/.env.supabase` (local Supabase config)
- Modify: `lib/sandbox.ts:80-106` (update `createSandbox` to pass Supabase env vars)

**Step 1: Create snapshot Dockerfile**

Create `snapshot/Dockerfile`:

```dockerfile
FROM daytonaio/base:latest

# Install Postgres 16
RUN apt-get update && apt-get install -y \
    postgresql-16 \
    postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

# Install GoTrue (Supabase Auth)
RUN curl -L https://github.com/supabase/gotrue/releases/latest/download/gotrue-linux-amd64 \
    -o /usr/local/bin/gotrue && chmod +x /usr/local/bin/gotrue

# Install PostgREST
RUN curl -L https://github.com/PostgREST/postgrest/releases/latest/download/postgrest-v12-linux-static-x64.tar.xz \
    | tar xJ -C /usr/local/bin/

# Pre-install common npm deps in workspace
WORKDIR /workspace
COPY snapshot/package-base.json /workspace/package.json
RUN bun install

# Supabase config
COPY snapshot/.env.supabase /etc/supabase/.env
COPY snapshot/supabase-init.sh /usr/local/bin/supabase-init.sh
RUN chmod +x /usr/local/bin/supabase-init.sh

# Start services on boot
CMD ["/usr/local/bin/supabase-init.sh"]
```

**Step 2: Create startup script**

Create `snapshot/supabase-init.sh`:

```bash
#!/bin/bash
set -e

# Start Postgres
pg_ctlcluster 16 main start

# Create default database
su postgres -c "psql -c \"CREATE DATABASE app;\""
su postgres -c "psql -d app -c \"CREATE EXTENSION IF NOT EXISTS pgcrypto;\""
su postgres -c "psql -d app -c \"CREATE EXTENSION IF NOT EXISTS uuid-ossp;\""

# Generate JWT secret and keys
JWT_SECRET=$(openssl rand -hex 32)
ANON_KEY=$(openssl rand -hex 32)
SERVICE_ROLE_KEY=$(openssl rand -hex 32)

# Write keys to env file (readable by generated apps)
cat > /workspace/.env.local <<EOF
VITE_SUPABASE_URL=http://localhost:3001
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
EOF

# Start GoTrue (auth server) on port 9999
GOTRUE_DB_DATABASE_URL="postgres://postgres@localhost:5432/app?sslmode=disable" \
GOTRUE_JWT_SECRET="${JWT_SECRET}" \
GOTRUE_SITE_URL="http://localhost:3000" \
gotrue serve &

# Start PostgREST on port 3001
PGRST_DB_URI="postgres://postgres@localhost:5432/app" \
PGRST_DB_ANON_ROLE="anon" \
PGRST_JWT_SECRET="${JWT_SECRET}" \
PGRST_SERVER_PORT=3001 \
postgrest /dev/null &

echo "Supabase services ready"

# Keep container alive
exec tail -f /dev/null
```

**Step 3: Create base package.json for snapshot**

Create `snapshot/package-base.json` with the common deps that every generated app needs (react, vite, tailwind, @supabase/supabase-js, etc.). This pre-populates `node_modules` in the snapshot so `bun install` during generation only adds template-specific deps.

Extract the base deps from `templates/scaffold/package.json.hbs`.

**Step 4: Build and register the snapshot**

```bash
# Build the image
docker build -t vibestack-snapshot -f snapshot/Dockerfile .

# Register with Daytona (exact command depends on Daytona's snapshot API)
# Update DAYTONA_SNAPSHOT_ID in .env.local
```

**Step 5: Commit**

```bash
git add snapshot/
git commit -m "feat: Daytona snapshot with Supabase services pre-installed"
```

---

## Task 4: Apply Local Migrations During Generation

When the sandbox has local Postgres, apply migrations immediately instead of waiting for cloud Supabase.

**Files:**
- Modify: `app/api/projects/generate/route.ts` (apply migration to local Postgres)
- Create: `lib/local-supabase.ts` (helper for local Postgres operations)

**Step 1: Create local Supabase helper**

Create `lib/local-supabase.ts`:

```typescript
import type { Sandbox } from '@daytonaio/sdk';
import { runCommand } from './sandbox';

/**
 * Apply a SQL migration to the sandbox-local Postgres.
 * Postgres is pre-installed in the snapshot and running on localhost:5432.
 */
export async function applyLocalMigration(
  sandbox: Sandbox,
  migrationSQL: string,
): Promise<void> {
  // Write migration to temp file (avoids shell escaping issues)
  await sandbox.fs.uploadFile(
    Buffer.from(migrationSQL),
    '/tmp/migration.sql'
  );

  const result = await runCommand(
    sandbox,
    'psql -h localhost -U postgres -d app -f /tmp/migration.sql',
    'apply-migration',
    { cwd: '/workspace', timeout: 30 }
  );

  if (result.exitCode !== 0) {
    throw new Error(`Local migration failed: ${result.stdout}\n${result.stderr || ''}`);
  }

  console.log('[local-supabase] Migration applied successfully');
}

/**
 * Read the local Supabase credentials from the sandbox's .env.local.
 * These are generated at snapshot boot time.
 */
export async function getLocalSupabaseCredentials(
  sandbox: Sandbox,
): Promise<{ url: string; anonKey: string; serviceRoleKey: string }> {
  const envContent = await sandbox.fs.downloadFile('/workspace/.env.local');
  const envStr = envContent.toString();

  const url = envStr.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim() || 'http://localhost:3001';
  const anonKey = envStr.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim() || '';
  const serviceRoleKey = envStr.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim() || '';

  return { url, anonKey, serviceRoleKey };
}
```

**Step 2: Apply migration right after scaffold phase in generate route**

In `app/api/projects/generate/route.ts`, after the scaffold phase and before starting the dev server:

```typescript
        // Apply migration to local Postgres (instant)
        const migrationContent = generatedFiles?.get("supabase/migrations/001_init.sql")
          ?? scaffoldFiles.find(f => f.path === "supabase/migrations/001_init.sql")?.content;
        if (migrationContent) {
          const { applyLocalMigration } = await import("@/lib/local-supabase");
          await applyLocalMigration(sandbox, migrationContent);
          emit({ type: "checkpoint", label: "Database ready", status: "complete" });
        }
```

**Step 3: Commit**

```bash
git add lib/local-supabase.ts app/api/projects/generate/route.ts
git commit -m "feat: apply migrations to sandbox-local Postgres instantly"
```

---

## Task 5: Pre-Built Vercel Deploy

Build in the sandbox, upload artifacts directly — skip Vercel's build step.

**Files:**
- Modify: `app/api/projects/deploy/route.ts` (add pre-built deploy path)
- Modify: `lib/sandbox.ts` (add `downloadDirectory` filter for dist/)

**Step 1: Add `buildInSandbox` function to deploy route**

In `app/api/projects/deploy/route.ts`, add a new function:

```typescript
/**
 * Build the app in the sandbox with production env vars.
 * Returns the built files from dist/.
 */
async function buildInSandbox(
  sandbox: Sandbox,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<Array<{ path: string; content: Buffer }>> {
  // Write production env vars
  const envContent = `VITE_SUPABASE_URL=${supabaseUrl}\nVITE_SUPABASE_ANON_KEY=${supabaseAnonKey}\n`;
  await sandbox.fs.uploadFile(Buffer.from(envContent), '/workspace/.env.production');

  // Run production build
  const result = await runCommand(
    sandbox,
    'bun run build',
    'prod-build',
    { cwd: '/workspace', timeout: 120 }
  );

  if (result.exitCode !== 0) {
    throw new Error(`Production build failed: ${result.stdout}\n${result.stderr || ''}`);
  }

  // Download dist/
  return await downloadDirectory(sandbox, '/workspace/dist');
}
```

**Step 2: Update deploy flow to prefer pre-built path**

In the `POST` handler, after getting the sandbox, add the pre-built path:

```typescript
    // Prefer pre-built deploy (build in sandbox → upload to Vercel)
    if (project.sandbox_id && project.supabase_url && project.supabase_anon_key) {
      console.log(`[deploy] Building in sandbox and deploying pre-built...`);
      const builtFiles = await buildInSandbox(
        sandbox,
        project.supabase_url,
        project.supabase_anon_key,
      );
      console.log(`[deploy] Built ${builtFiles.length} files, deploying to Vercel...`);
      deployUrl = await deployToVercel(project.name, builtFiles, vercelTeamId, supabaseEnvVars);
      vercelProjectSlug = project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    } else if (project.github_repo_url) {
      // Fallback: deploy from GitHub
      // ... existing code
    }
```

**Step 3: Commit**

```bash
git add app/api/projects/deploy/route.ts
git commit -m "perf: pre-built Vercel deploy — build in sandbox, skip Vercel build"
```

---

## Task 6: Parallel Cloud Supabase Provisioning

Move cloud Supabase provisioning to start at generation time, so it's ready by deploy time.

**Files:**
- Modify: `app/api/projects/generate/route.ts` (already has parallel provisioning — just ensure credentials are stored)
- Modify: `app/api/projects/deploy/route.ts` (apply migration to cloud Supabase before building)

**Step 1: Ensure generate route stores cloud Supabase credentials**

This is already implemented from the previous session's fix (commit `ad11b48`). Verify the code at lines 159-184 stores `supabase_url`, `supabase_anon_key`, and `supabase_service_role_key`.

**Step 2: Apply cloud migration at deploy time**

In `app/api/projects/deploy/route.ts`, before building, apply the migration to the cloud Supabase project:

```typescript
    // Apply migration to cloud Supabase if not already done
    if (project.supabase_project_id) {
      const migrationFile = await sandbox.fs.downloadFile('/workspace/supabase/migrations/001_init.sql')
        .catch(() => null);
      if (migrationFile) {
        const { runMigration } = await import("@/lib/supabase-mgmt");
        const result = await runMigration(project.supabase_project_id, migrationFile.toString());
        if (!result.success) {
          throw new Error(`Cloud migration failed: ${result.error}`);
        }
        console.log('[deploy] Cloud Supabase migration applied');
      }
    }
```

**Step 3: Commit**

```bash
git add app/api/projects/deploy/route.ts
git commit -m "feat: apply cloud Supabase migration at deploy time"
```

---

## Task 7: Update E2E Test for Fast Pipeline

Update the E2E test to expect the new faster flow.

**Files:**
- Modify: `e2e/real-generation.spec.ts`

**Step 1: Update test expectations**

Key changes:
- Expect preview URL to appear much earlier (after scaffold, not after full generation)
- Reduce timeout for "first file completed" (was 300s, now 60s)
- Add assertion that preview is visible before generation completes
- Keep deploy test unchanged (cloud Supabase + Vercel still take time)

**Step 2: Commit**

```bash
git add e2e/real-generation.spec.ts
git commit -m "test: update E2E test for fast pipeline expectations"
```

---

## Implementation Order Summary

| Task | What | Impact | Dependencies |
|------|------|--------|-------------|
| 1 | tsc --noEmit verification | Build check 5-10x faster | None |
| 2 | Two-phase pipeline + HMR | Preview live in ~30s | Task 1 |
| 3 | Supabase in snapshot | Zero DB provisioning wait | None (parallel with 1-2) |
| 4 | Local migration | DB ready instantly | Task 3 |
| 5 | Pre-built Vercel deploy | Deploy 10x faster | None (parallel with 3-4) |
| 6 | Parallel cloud Supabase | DB ready at deploy time | Task 3 |
| 7 | E2E test update | Validate everything | Tasks 1-6 |

Tasks 1-2 and 3-5 can be done in parallel by separate agents.
