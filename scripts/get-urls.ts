import { Daytona } from '@daytonaio/sdk';

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) { console.error('Missing DAYTONA_API_KEY'); process.exit(1); }
  const d = new Daytona({ apiKey, apiUrl: 'https://app.daytona.io/api', _experimental: {} });
  const result = await d.list();
  const sandboxes = (result as any).items || result;
  for (const s of sandboxes) {
    console.log(`Sandbox: ${s.id}`);
    const preview = await s.getPreviewLink(3000);
    const code = await s.getPreviewLink(13337);
    console.log(`  Preview:`, JSON.stringify(preview));
    console.log(`  Code:`, JSON.stringify(code));
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
