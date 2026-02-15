import { Daytona, Image } from '@daytonaio/sdk'

const SNAPSHOT_NAME = 'vibestack-workspace'

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY
  if (!apiKey) {
    console.error('DAYTONA_API_KEY environment variable is required')
    process.exit(1)
  }

  const daytona = new Daytona({
    apiKey,
    apiUrl: 'https://app.daytona.io/api',
    _experimental: {},
  })

  console.log('Building snapshot image...')

  // Use official Bun image — bun is on PATH, includes Node.js compat
  const OPENVSCODE_VERSION = 'v1.98.2'
  const image = Image.base('oven/bun:1-debian')
    .runCommands(
      'apt-get update && apt-get install -y git curl tmux && rm -rf /var/lib/apt/lists/*',
    )
    // Install OpenVSCode Server (browser IDE on port 13337)
    .runCommands(
      `curl -fsSL https://github.com/gitpod-io/openvscode-server/releases/download/openvscode-server-${OPENVSCODE_VERSION}/openvscode-server-${OPENVSCODE_VERSION}-linux-x64.tar.gz | tar xz -C /opt && mv /opt/openvscode-server-${OPENVSCODE_VERSION}-linux-x64 /opt/openvscode-server`,
    )
    // Pre-cache common deps (includes PGlite for migration validation)
    .workdir('/workspace')
    .addLocalFile('snapshot/package-base.json', '/workspace/package.json')
    .runCommands('bun install')
    // Install tsc globally so build verification can run bare `tsc --noEmit`
    .runCommands('bun add -g typescript')
    // Install OxLint globally — single Rust binary, used for auto-fix + lint diagnostics
    .runCommands('bun install -g oxlint')
    // Pre-warm Vite + TypeScript caches with minimal scaffold
    .addLocalFile('snapshot/warmup-scaffold/vite.config.ts', '/workspace/vite.config.ts')
    .addLocalFile('snapshot/warmup-scaffold/tsconfig.json', '/workspace/tsconfig.json')
    .addLocalFile('snapshot/warmup-scaffold/tsconfig.app.json', '/workspace/tsconfig.app.json')
    .addLocalFile('snapshot/warmup-scaffold/index.html', '/workspace/index.html')
    .addLocalFile('snapshot/warmup-scaffold/env.d.ts', '/workspace/env.d.ts')
    .addLocalFile('snapshot/warmup-scaffold/src/App.tsx', '/workspace/src/App.tsx')
    .addLocalFile('snapshot/warmup-scaffold/src/main.tsx', '/workspace/src/main.tsx')
    .addLocalFile('snapshot/warmup-scaffold/src/index.css', '/workspace/src/index.css')
    .addLocalFile('snapshot/warmup-scaffold/src/lib/utils.ts', '/workspace/src/lib/utils.ts')
    // Run dev server briefly to pre-bundle Vite deps, then tsc to warm tsbuildinfo
    .runCommands(
      'bun run dev &>/dev/null & DEV_PID=$! && sleep 8 && kill $DEV_PID 2>/dev/null || true',
    )
    .runCommands('npx tsc --noEmit 2>/dev/null || true')
    // Entrypoint script: starts OpenVSCode + bun dev in tmux
    .addLocalFile('snapshot/entrypoint.sh', '/opt/entrypoint.sh')
    .runCommands('chmod +x /opt/entrypoint.sh')
    // Hint in new terminal sessions about tmux dev server
    .addLocalFile('snapshot/bashrc-extra.sh', '/tmp/bashrc-extra.sh')
    .runCommands('cat /tmp/bashrc-extra.sh >> /root/.bashrc && rm /tmp/bashrc-extra.sh')

  // Delete existing snapshot if it exists
  try {
    const existing = await daytona.snapshot.get(SNAPSHOT_NAME)
    console.log(`Deleting existing snapshot: ${SNAPSHOT_NAME}`)
    await daytona.snapshot.delete(existing)
    // Wait for server-side cleanup (deletion is async)
    console.log('Waiting for snapshot deletion to propagate...')
    await new Promise((resolve) => setTimeout(resolve, 15000))
  } catch {
    // Snapshot doesn't exist yet, that's fine
  }

  console.log('Creating snapshot (this may take a few minutes)...')
  const snapshot = await daytona.snapshot.create(
    {
      name: SNAPSHOT_NAME,
      image,
      entrypoint: ['/opt/entrypoint.sh'],
      resources: { cpu: 2, memory: 4, disk: 10 },
    },
    { onLogs: (chunk: string) => process.stdout.write(chunk), timeout: 600 },
  )

  console.log(`\n✓ Snapshot created: ${snapshot.name}`)
  console.log(`\nSet in your .env:\n  DAYTONA_SNAPSHOT_ID=${snapshot.name}`)
}

main().catch((err) => {
  console.error('Failed to create snapshot:', err)
  process.exit(1)
})
