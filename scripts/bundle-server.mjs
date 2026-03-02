/**
 * Pre-bundle the server into a single ESM file for Vercel.
 *
 * Why: Vercel compiles api/index.ts to CJS, but octokit and @octokit/auth-app
 * are ESM-only (no "require" export). Node.js CJS can't load them.
 * Bundling to ESM resolves all imports at build time, avoiding the CJS/ESM conflict.
 *
 * The output goes to api/index.js with a local api/package.json ("type":"module")
 * so Vercel's Node.js runtime treats it as ESM.
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: 'api/index.js',
  // Use ESM entry points for dual-published packages (fixes jsonc-parser)
  mainFields: ['module', 'main'],
  // Keep the default export compatible with Vercel's handler detection
  banner: {
    js: '// Bundled by esbuild for Vercel serverless',
  },
  // Externalize nothing — bundle everything into one file
  external: [],
  // Source maps for debugging in Vercel logs
  sourcemap: true,
  // Minify identifiers but keep readable output
  minifySyntax: true,
  // Define __dirname/__filename for packages that reference them
  define: {
    'import.meta.url': 'import.meta.url',
  },
})

console.log('✓ Server bundled to api/index.js (ESM)')
