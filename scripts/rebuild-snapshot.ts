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
    _experimental: {},
  });

  console.log('Building snapshot image...');

  // Use official Bun image — bun is on PATH, includes Node.js compat
  const image = Image.base('oven/bun:1-debian')
    .runCommands('apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*')
    .workdir('/workspace')
    .addLocalFile('scripts/snapshot-package.json', '/workspace/package.json')
    .runCommands('bun install');

  // Delete existing snapshot if it exists
  try {
    const existing = await daytona.snapshot.get(SNAPSHOT_NAME);
    console.log(`Deleting existing snapshot: ${SNAPSHOT_NAME}`);
    await daytona.snapshot.delete(existing);
    // Wait for server-side cleanup
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch {
    // Snapshot doesn't exist yet, that's fine
  }

  console.log('Creating snapshot (this may take a few minutes)...');
  const snapshot = await daytona.snapshot.create(
    { name: SNAPSHOT_NAME, image },
    { onLogs: (chunk: string) => process.stdout.write(chunk), timeout: 600 },
  );

  console.log(`\n✓ Snapshot created: ${snapshot.name}`);
  console.log(`\nSet in your .env:\n  DAYTONA_SNAPSHOT_ID=${snapshot.name}`);
}

main().catch((err) => {
  console.error('Failed to create snapshot:', err);
  process.exit(1);
});
