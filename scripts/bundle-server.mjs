// Pre-bundle the Hono server for Vercel's serverless runtime.
// Uses esbuild (not bun build) because esbuild correctly inlines UMD
// packages like jsonc-parser that use dynamic require() patterns.
import { buildSync } from 'esbuild'

buildSync({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'api/index.mjs',
  minify: true,
  treeShaking: true,
  // Node.js built-in modules can't be bundled — polyfill require() for CJS deps
  banner: {
    js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
  },
})

console.log('Server bundled to api/index.mjs')
