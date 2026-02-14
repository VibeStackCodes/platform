import { Daytona } from "@daytonaio/sdk";

const d = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY as string,
  apiUrl: "https://app.daytona.io/api",
  _experimental: {},
});

async function main() {
  const sandboxId = process.argv[2];
  if (!sandboxId) {
    const all = await d.list({}, 1, 5);
    console.log("Recent sandboxes:");
    for (const s of all.items) {
      console.log(`  ${s.id} — ${JSON.stringify(s.labels)}`);
    }
    return;
  }

  const sandbox = await d.get(sandboxId);
  const link = await sandbox.getPreviewLink(13337);
  console.log("Preview link URL:", link.url);
  console.log("Token:", link.token);

  // Test: preview link URL with X-Daytona-Preview-Token header
  console.log("\n=== Test: X-Daytona-Preview-Token header ===");
  const r1 = await fetch(link.url, {
    redirect: "manual",
    headers: { "X-Daytona-Preview-Token": link.token },
  });
  console.log(`Status: ${r1.status}`);
  if (r1.status >= 300 && r1.status < 400) {
    console.log("Still redirects:", r1.headers.get("location")?.substring(0, 80));
  } else {
    const body = await r1.text();
    console.log("Has VS Code:", body.includes("vscode-workbench"));
    console.log("Has JSON error appended:", body.includes('"statusCode":400'));
    console.log("Cookie:", r1.headers.get("set-cookie")?.substring(0, 80));
    console.log("Body length:", body.length);
  }

  // Test: preview link URL with cookie from signed URL
  console.log("\n=== Test: preview link + daytona-sandbox-auth cookie ===");
  // First get cookie from signed URL
  const signed = await sandbox.getSignedPreviewUrl(13337, 3600);
  const signedRes = await fetch(signed.url);
  const cookie = signedRes.headers.get("set-cookie")?.split(";")[0]; // name=value
  console.log("Got cookie from signed URL:", cookie?.substring(0, 60));

  // Try using that cookie on the preview link URL
  if (cookie) {
    const r2 = await fetch(link.url, {
      redirect: "manual",
      headers: { Cookie: cookie },
    });
    console.log(`Status with cookie: ${r2.status}`);
    if (r2.status >= 300 && r2.status < 400) {
      console.log("Still redirects");
    } else {
      const body = await r2.text();
      console.log("Has VS Code:", body.includes("vscode-workbench"));
    }
  }

  // Test: create a public sandbox and check if URL works
  console.log("\n=== Creating test public sandbox ===");
  try {
    const publicSandbox = await d.create({
      language: "typescript" as any,
      envVars: {},
      autoStopInterval: 5, // Short lived
      labels: { type: "test-public" },
      ephemeral: true,
      snapshot: "vibestack-workspace",
      public: true,
    } as any, { timeout: 60 });
    console.log("Public sandbox:", publicSandbox.id);

    const publicLink = await publicSandbox.getPreviewLink(13337);
    console.log("Public preview URL:", publicLink.url);

    // Test without auth
    const r3 = await fetch(publicLink.url, { redirect: "manual" });
    console.log(`Status (no auth): ${r3.status}`);
    if (r3.status >= 300 && r3.status < 400) {
      console.log("Redirects to:", r3.headers.get("location")?.substring(0, 80));
    } else {
      const body = await r3.text();
      console.log("Has VS Code:", body.includes("vscode-workbench"));
    }

    // Clean up
    await publicSandbox.delete(30);
    console.log("Cleaned up test sandbox");
  } catch (err: any) {
    console.log("Public sandbox test failed:", err.message?.substring(0, 200));
  }
}

main().catch(console.error);
