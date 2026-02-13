# Daytona Sandbox Snapshot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate `npm install` from generation by building a Daytona snapshot with all deps pre-installed, and updating the template stack to Vite 7.3.1 + bun + Tailwind 4.1.

**Architecture:** A rebuild script uses the Daytona `Image` builder API to create a snapshot from a Dockerfile (base: `oven/bun:1-debian`, copies package.json, runs `bun install`). The sandbox module creates sandboxes from this snapshot and skips install.

**Tech Stack:** @daytonaio/sdk (Image, SnapshotService), bun, Vite 7.3.1, Tailwind 4.1

---

### Task 1: Upgrade package.json.hbs template

**Files:**
- Modify: `platform/templates/scaffold/package.json.hbs`

**Step 1: Update versions and add radix-ui**

Update `platform/templates/scaffold/package.json.hbs` to:

```json
{
  "name": "{{appName}}",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
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

Changes from current:
- `vite`: `^6.0.0` → `^7.3.1`
- `tailwindcss`: `^4.0.0` → `^4.1.0`
- `@tailwindcss/vite`: `^4.0.0` → `^4.1.0`
- Added `radix-ui: "^1.1.0"` to dependencies (always present since snapshot has it)

**Step 2: Verify**

Run: `cd platform && pnpm tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add platform/templates/scaffold/package.json.hbs
git commit -m "feat: upgrade template to Vite 7.3.1, Tailwind 4.1, add radix-ui"
```

---

### Task 2: Create snapshot package.json and rebuild script

**Files:**
- Create: `platform/scripts/snapshot-package.json`
- Create: `platform/scripts/rebuild-snapshot.ts`

**Step 1: Create snapshot-package.json**

Create `platform/scripts/snapshot-package.json` — this is the superset package.json used in the Docker image build. It must contain every dependency any generated app could need:

```json
{
  "name": "vibestack-workspace",
  "private": true,
  "version": "0.0.0",
  "type": "module",
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

**Step 2: Create rebuild-snapshot.ts**

Create `platform/scripts/rebuild-snapshot.ts`:

```typescript
import { Daytona, Image } from '@daytonaio/sdk';

const SNAPSHOT_NAME = 'vibestack-workspace';

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    console.error('DAYTONA_API_KEY environment variable is required');
    process.exit(1);
  }

  const daytona = new Daytona({
    apiKey,
    apiUrl: 'https://app.daytona.io/api',
    target: 'us',
  });

  console.log('Building snapshot image...');

  const image = Image.base('oven/bun:1-debian')
    .runCommands(
      'apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*',
    )
    .workdir('/workspace')
    .addLocalFile('scripts/snapshot-package.json', '/workspace/package.json')
    .runCommands('bun install');

  // Delete existing snapshot if it exists
  try {
    const existing = await daytona.snapshot.get(SNAPSHOT_NAME);
    console.log(`Deleting existing snapshot: ${SNAPSHOT_NAME}`);
    await daytona.snapshot.delete(existing);
  } catch {
    // Snapshot doesn't exist yet, that's fine
  }

  console.log('Creating snapshot (this may take a few minutes)...');
  const snapshot = await daytona.snapshot.create(
    { name: SNAPSHOT_NAME, image },
    { onLogs: (chunk) => process.stdout.write(chunk), timeout: 600 },
  );

  console.log(`\n✓ Snapshot created: ${snapshot.name}`);
  console.log(`\nSet in your .env:\n  DAYTONA_SNAPSHOT_ID=${snapshot.name}`);
}

main().catch((err) => {
  console.error('Failed to create snapshot:', err);
  process.exit(1);
});
```

**Step 3: Verify TypeScript**

Run: `cd platform && pnpm tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add platform/scripts/snapshot-package.json platform/scripts/rebuild-snapshot.ts
git commit -m "feat: add Daytona snapshot rebuild script"
```

---

### Task 3: Update sandbox.ts for snapshot support + bun

**Files:**
- Modify: `platform/lib/sandbox.ts`

**Step 1: Update createSandbox to use snapshot**

In `platform/lib/sandbox.ts`, update the `createSandbox` function to pass `snapshot` when `DAYTONA_SNAPSHOT_ID` is set:

```typescript
export async function createSandbox(config: SandboxConfig = {}): Promise<Sandbox> {
  const daytona = getDaytonaClient();
  const snapshotId = process.env.DAYTONA_SNAPSHOT_ID;

  try {
    const sandbox = await daytona.create({
      language: config.language || 'typescript',
      envVars: config.envVars || {},
      autoStopInterval: config.autoStopInterval || 60,
      labels: config.labels || {},
      ephemeral: false,
      ...(snapshotId ? { snapshot: snapshotId } : {}),
    }, {
      timeout: 60,
    });

    console.log(`✓ Sandbox created: ${sandbox.id}${snapshotId ? ` (from snapshot: ${snapshotId})` : ''}`);
    return sandbox;
  } catch (error) {
    console.error('Failed to create sandbox:', error);
    throw new Error(`Sandbox creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

**Step 2: Update initGeneratedApp to skip install when snapshot used and use bun**

In `platform/lib/sandbox.ts`, update `initGeneratedApp`:

- Change `npm install` to `bun install`
- Skip the install step entirely when `DAYTONA_SNAPSHOT_ID` is set
- Change `npm run dev` to `bun run dev`

```typescript
export async function initGeneratedApp(
  sandbox: Sandbox,
  files: Array<{ content: string; path: string }>,
  workDir: string = '/workspace'
): Promise<void> {
  try {
    // 1. Upload all generated files
    console.log('Uploading generated files...');
    await uploadFiles(sandbox, files);

    // 2. Initialize git repo
    console.log('Initializing git...');
    await runCommand(
      sandbox,
      'git init && git config user.email "vibestack@generated.app" && git config user.name "VibeStack"',
      'git-init',
      { cwd: workDir, timeout: 30 }
    );

    // 3. Install dependencies (skip if snapshot has them pre-installed)
    const hasSnapshot = !!process.env.DAYTONA_SNAPSHOT_ID;
    if (!hasSnapshot) {
      console.log('Installing dependencies...');
      const installResult = await runCommand(
        sandbox,
        'bun install',
        'init-install',
        { cwd: workDir, timeout: 300 }
      );

      if (installResult.exitCode !== 0) {
        throw new Error(`bun install failed: ${installResult.stdout}`);
      }
    } else {
      console.log('Skipping install (deps pre-installed in snapshot)');
    }

    // 4. Initial commit with scaffolding
    await runCommand(
      sandbox,
      'git add -A && git commit -m "chore: initial project scaffolding"',
      'git-initial-commit',
      { cwd: workDir, timeout: 30 }
    );

    // 5. Start dev server in background (async mode)
    console.log('Starting dev server...');
    await runCommand(
      sandbox,
      'bun run dev',
      'dev-server',
      { cwd: workDir, async: true, timeout: 0 }
    );

    // 6. Wait for server to be ready (poll port 3000)
    await waitForServerReady(sandbox, 3000, 30);

    console.log('✓ Generated app initialized and running');
  } catch (error) {
    throw new Error(`Failed to initialize app: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

**Step 3: Verify**

Run: `cd platform && pnpm tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add platform/lib/sandbox.ts
git commit -m "feat: snapshot-aware sandbox creation, switch npm to bun"
```

---

### Task 4: Update .env.example and verify end-to-end

**Files:**
- Modify: `platform/.env.example` (if it exists) or create it

**Step 1: Add DAYTONA_SNAPSHOT_ID to env example**

Add to `.env.example` (or `.env.local.example`):

```
# Daytona sandbox snapshot (optional — speeds up generation by skipping npm install)
# Run: npx tsx scripts/rebuild-snapshot.ts to create
DAYTONA_SNAPSHOT_ID=vibestack-workspace
```

**Step 2: TypeScript check**

Run: `cd platform && pnpm tsc --noEmit 2>&1 | head -20`
Expected: Clean

**Step 3: Verify no broken imports**

Run: `cd platform && grep -r "npm install\|npm run" lib/ templates/ --include="*.ts" --include="*.hbs" 2>/dev/null`
Expected: No results (all switched to bun)

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add DAYTONA_SNAPSHOT_ID to env example"
```
