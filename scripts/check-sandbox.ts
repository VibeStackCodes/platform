import { Daytona } from "@daytonaio/sdk";

const d = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY as string,
  apiUrl: "https://app.daytona.io/api",
  _experimental: {},
});

async function main() {
  const all = await d.list({}, 1, 20);
  const sandbox = await d.get(all.items[0].id);

  // Get a signed URL
  const signed1 = await sandbox.getSignedPreviewUrl(3000, 3600);
  console.log("Signed URL 1:", signed1.url);

  // Fetch it twice (test reusability)
  const res1 = await fetch(signed1.url);
  console.log("First fetch:", res1.status);

  const res2 = await fetch(signed1.url);
  console.log("Second fetch:", res2.status);

  // Get another signed URL (different token?)
  const signed2 = await sandbox.getSignedPreviewUrl(3000, 3600);
  console.log("\nSigned URL 2:", signed2.url);
  console.log("Same URL?", signed1.url === signed2.url);

  // Does fetching URL 2 invalidate URL 1?
  const res3 = await fetch(signed2.url);
  console.log("Fetch URL 2:", res3.status);

  const res4 = await fetch(signed1.url);
  console.log("Re-fetch URL 1 after URL 2:", res4.status);
}

main().catch(console.error);
