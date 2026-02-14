import { Daytona } from '@daytonaio/sdk';

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY;
  const snapshotId = process.env.DAYTONA_SNAPSHOT_ID;
  if (!apiKey || !snapshotId) { console.error('DAYTONA_API_KEY and DAYTONA_SNAPSHOT_ID required'); process.exit(1); }
  const d = new Daytona({ apiKey, apiUrl: 'https://app.daytona.io/api', _experimental: {} });

  // Clean up existing sandboxes (ignore errors for already-deleting ones)
  const result = await d.list();
  const sandboxes = (result as any).items || result;
  for (const s of sandboxes) {
    try {
      console.log(`Deleting sandbox: ${s.id}`);
      await d.delete(s);
    } catch (e: any) {
      console.log(`  Skip (already deleting): ${e.message?.slice(0, 60)}`);
    }
  }

  // Poll until all sandboxes are gone
  console.log('Waiting for all sandboxes to be cleaned up...');
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const check = await d.list();
    const remaining = (check as any).items || check;
    console.log(`  ${remaining.length} sandboxes remaining...`);
    if (remaining.length === 0) break;
  }

  console.log('Creating sandbox...');
  const sandbox = await d.create({
    language: 'typescript',
    envVars: {},
    autoStopInterval: 60,
    labels: { type: 'manual-test' },
    ephemeral: false,
    snapshot: snapshotId,
  }, { timeout: 60 });

  console.log(`\nSandbox ID: ${sandbox.id}`);
  console.log(`Preview (3000): ${sandbox.getPreviewLink(3000)}`);
  console.log(`Code Server (13337): ${sandbox.getPreviewLink(13337)}`);
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
