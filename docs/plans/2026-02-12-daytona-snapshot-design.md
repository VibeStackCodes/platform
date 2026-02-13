# Daytona Sandbox Snapshot Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate `npm install` from generation by creating a pre-warmed Daytona snapshot with all possible dependencies pre-installed. Generation just copies files into an already-ready sandbox.

**Architecture:** A rebuild script creates a sandbox, installs the full superset of all dependencies (scaffold + all shadcn component deps), snapshots it, and outputs the snapshot ID. The template pipeline creates sandboxes from this snapshot, skipping install entirely.

## Stack Upgrade

Upgrade the generated app stack as part of this work:

| Package | Current | Target |
|---------|---------|--------|
| vite | ^6.0.0 | ^7.3.1 |
| tailwindcss | ^4.0.0 | ^4.1.0 |
| @tailwindcss/vite | ^4.0.0 | ^4.1.0 |
| Package manager | npm | bun |

## Snapshot Contents

The snapshot is a Daytona sandbox with all dependencies pre-installed:

**Dependencies (always present):**
- react ^19.0.0, react-dom ^19.0.0
- react-router ^7.0.0
- @supabase/supabase-js ^2.95.0
- lucide-react ^0.460.0
- clsx ^2.1.1, tailwind-merge ^3.0.0
- class-variance-authority ^0.7.1
- radix-ui ^1.1.0
- zod ^3.24.0

**Dev dependencies:**
- vite ^7.3.1
- @vitejs/plugin-react ^4.3.0
- typescript ^5.7.0
- @types/react ^19.0.0, @types/react-dom ^19.0.0
- tailwindcss ^4.1.0
- @tailwindcss/vite ^4.1.0

**Filesystem state:**
- `/workspace/node_modules/` — all deps installed
- `/workspace/package.json` — superset package.json
- `/workspace/bun.lockb` — lockfile

## How Daytona Snapshots Work

Daytona snapshots are **built from Docker images**, not runtime state captures. The SDK provides:

- `daytona.snapshot.create({ name, image })` — builds a snapshot from an `Image` definition (Dockerfile-based)
- `daytona.create({ snapshot: 'name' })` — creates a sandbox from a named snapshot (fast)
- `Image.base('node:22-slim')` — base image builder with chainable methods

## Rebuild Script

`platform/scripts/rebuild-snapshot.ts`:

```typescript
import { Daytona, Image } from '@daytonaio/sdk';

const SNAPSHOT_NAME = 'vibestack-workspace';

const daytona = new Daytona({ apiKey, apiUrl: 'https://app.daytona.io/api', target: 'us' });

// Build image with all deps pre-installed
const image = Image.base('oven/bun:1-debian')
  .runCommands(
    'apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*',
  )
  .workdir('/workspace')
  .addLocalFile('scripts/snapshot-package.json', '/workspace/package.json')
  .runCommands('bun install');

// Create (or replace) snapshot
const snapshot = await daytona.snapshot.create(
  { name: SNAPSHOT_NAME, image },
  { onLogs: console.log, timeout: 300 }
);

console.log(`Snapshot created: ${snapshot.name}`);
console.log(`Set DAYTONA_SNAPSHOT_ID=${snapshot.name} in .env`);
```

`platform/scripts/snapshot-package.json` — the superset package.json used during snapshot build (identical deps to package.json.hbs but with fixed versions, no Handlebars).

Run: `npx tsx scripts/rebuild-snapshot.ts`
Output: `DAYTONA_SNAPSHOT_ID=vibestack-workspace` — set in `.env`

## Pipeline Changes

### sandbox.ts — Snapshot-aware creation

```typescript
export async function createSandbox(config: SandboxConfig = {}): Promise<Sandbox> {
  const daytona = getDaytonaClient();
  const snapshotId = process.env.DAYTONA_SNAPSHOT_ID;

  const sandbox = await daytona.create({
    language: config.language || 'typescript',
    envVars: config.envVars || {},
    autoStopInterval: config.autoStopInterval || 60,
    labels: config.labels || {},
    ephemeral: false,
    ...(snapshotId ? { snapshot: snapshotId } : {}),
  }, { timeout: 60 });

  return sandbox;
}
```

### sandbox.ts — Skip install when snapshot used

```typescript
export async function initGeneratedApp(
  sandbox: Sandbox,
  files: Array<{ content: string; path: string }>,
  workDir: string = '/workspace'
): Promise<void> {
  // 1. Upload generated files (overwrites snapshot's package.json with app-specific one)
  await uploadFiles(sandbox, files);

  // 2. Git init
  await runCommand(sandbox, 'git init && git config ...', 'git-init', { cwd: workDir });

  // 3. Install deps — skip if snapshot used (deps already in node_modules)
  const hasSnapshot = !!process.env.DAYTONA_SNAPSHOT_ID;
  if (!hasSnapshot) {
    const result = await runCommand(sandbox, 'bun install', 'init-install', { cwd: workDir, timeout: 300 });
    if (result.exitCode !== 0) throw new Error(`bun install failed: ${result.stdout}`);
  }

  // 4. Commit + start dev server (unchanged)
  ...
}
```

### package.json.hbs — Upgraded versions

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.0.0",
    "@supabase/supabase-js": "^2.95.0",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.0",
    "zod": "^3.24.0",
    "class-variance-authority": "^0.7.1",
    "radix-ui": "^1.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^7.3.1",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/vite": "^4.1.0"
  }
}
```

## What Changes

| File | Change |
|------|--------|
| `templates/scaffold/package.json.hbs` | Upgrade Vite 7.3.1, Tailwind 4.1, add radix-ui |
| `lib/sandbox.ts` | Snapshot-aware creation, bun instead of npm, skip install when snapshot |
| `scripts/rebuild-snapshot.ts` | NEW — builds snapshot from Image definition |
| `scripts/snapshot-package.json` | NEW — superset package.json for snapshot |
| `.env.example` | Add `DAYTONA_SNAPSHOT_ID` |

## Fallback Behavior

If `DAYTONA_SNAPSHOT_ID` is not set:
- Creates fresh sandbox (no snapshot)
- Runs `bun install` during `initGeneratedApp()`
- Everything works, just slower (~30-60s install time)

This means local dev and CI can work without a snapshot configured.
