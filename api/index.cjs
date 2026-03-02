// Placeholder — overwritten by esbuild during `bun run build`.
// Committed so Vercel detects the function entry point pre-build.
module.exports = { default: (req, res) => { res.statusCode = 503; res.end('Build not run') } }
