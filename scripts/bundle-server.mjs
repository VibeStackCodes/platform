// Pre-bundle the Hono server for Vercel's serverless runtime.
// Uses esbuild (not bun build) because esbuild correctly inlines UMD
// packages like jsonc-parser that use dynamic require() patterns.
import { buildSync } from 'esbuild'

buildSync({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'api/index.js',
  minify: true,
  treeShaking: true,
  // Polyfill CJS globals for ESM: require(), __filename, __dirname
  banner: {
    js: [
      "import{createRequire}from'module';",
      "import{fileURLToPath as __bundled_fileURLToPath}from'url';",
      "import{dirname as __bundled_dirname}from'path';",
      "const require=createRequire(import.meta.url);",
      "const __filename=__bundled_fileURLToPath(import.meta.url);",
      "const __dirname=__bundled_dirname(__filename);",
    ].join(''),
  },
})

console.log('Server bundled to api/index.js')
