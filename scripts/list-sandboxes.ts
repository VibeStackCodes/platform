import { Daytona } from '@daytonaio/sdk';

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) { console.error('DAYTONA_API_KEY required'); process.exit(1); }
  const d = new Daytona({ apiKey, apiUrl: 'https://app.daytona.io/api', _experimental: {} });
  const result = await d.list();
  const sandboxes = (result as any).items || result;
  for (const s of sandboxes) {
    console.log(s.id, s.instance?.state ?? 'unknown', JSON.stringify(s.instance?.labels ?? {}));
  }
  console.log('Total:', sandboxes.length);
}
main();
