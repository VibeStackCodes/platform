// Pre-bundle the Hono server for Vercel's serverless runtime.
// Uses CJS format so require(), __filename, __dirname are native —
// no polyfills needed. jsonc-parser's UMD dynamic require() patterns
// resolve correctly in CJS because esbuild inlines the CJS modules.
// Output uses .cjs extension since package.json has "type": "module".
import { buildSync } from 'esbuild'

buildSync({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'api/index.js',
  minify: true,
  treeShaking: true,
})

console.log('Server bundled to api/index.js')
