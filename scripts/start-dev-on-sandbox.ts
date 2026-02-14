import { Daytona } from '@daytonaio/sdk';

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) { console.error('Missing DAYTONA_API_KEY'); process.exit(1); }
  const d = new Daytona({ apiKey, apiUrl: 'https://app.daytona.io/api', _experimental: {} });
  const result = await d.list();
  const sandboxes = (result as any).items || result;
  const s = sandboxes[0];
  if (!s) { console.error('No sandbox found'); process.exit(1); }
  console.log('Sandbox:', s.id);

  // Start bun run dev in background
  console.log('Starting bun run dev...');
  s.process.executeCommand('cd /workspace && bun run dev --host 0.0.0.0 &', '/workspace').catch(() => {});

  // Wait for it to be ready
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const curl = await s.process.executeCommand('curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "FAIL"', '/workspace');
    console.log(`  Poll ${i + 1}: ${curl.result}`);
    if (curl.result.trim() === '200') {
      const preview = await s.getPreviewLink(3000);
      console.log(`\nDev server ready: ${(preview as any).url}`);
      return;
    }
  }
  console.error('Dev server failed to start');
}
main().catch(e => { console.error(e.message); process.exit(1); });
