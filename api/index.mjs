// Placeholder — overwritten by esbuild during `bun run build`.
// Committed so Vercel detects the function entry point pre-build.
export default { fetch: () => new Response('Build not run', { status: 503 }) }
