/**
 * Pre-bundle the server into a single CJS file for Vercel.
 *
 * Why: octokit and @octokit/auth-app are ESM-only (no "require" export).
 * esbuild resolves all imports at build time — the CJS output has no
 * dynamic import/require calls for ESM-only deps, so @vercel/node is happy.
 *
 * CJS is the native format @vercel/node expects. No "type":"module" needed,
 * no createRequire banner, no ESM compat hacks.
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: 'api/index.js',
  // Use ESM entry points for dual-published packages (fixes jsonc-parser)
  mainFields: ['module', 'main'],
  // Diagnostic banner — first line of output when Lambda loads the module
  banner: {
    js: 'console.log("[vercel] api/index.js module load START", new Date().toISOString());',
  },
  // Externalize nothing — bundle everything into one file
  external: [],
  // No source map — saves ~50MB in function size
  sourcemap: false,
  // Minify syntax but keep readable output
  minifySyntax: true,
})

console.log('✓ Server bundled to api/index.js (CJS)')
