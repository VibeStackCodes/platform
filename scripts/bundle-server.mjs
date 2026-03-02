// Pre-bundle the Hono server for Vercel's serverless runtime.
// Uses CJS format so require(), __filename, __dirname are native.
// mainFields prefers ESM ("module") over CJS ("main") to avoid
// jsonc-parser's UMD pattern that uses dynamic require() through
// a function parameter — which defeats esbuild's module resolution.
import { buildSync } from 'esbuild'

buildSync({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'api/index.js',
  minify: true,
  treeShaking: true,
  // Prefer ESM entry points to avoid UMD dynamic require() patterns
  mainFields: ['module', 'main'],
})

console.log('Server bundled to api/index.js')
