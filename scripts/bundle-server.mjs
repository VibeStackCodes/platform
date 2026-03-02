// Pre-bundle the Hono server for Vercel's serverless runtime.
// esbuild bundles everything into a single file. Packages with UMD
// dynamic require() patterns (jsonc-parser, @sentry/node) are marked
// external — Vercel's nft traces them from node_modules at deploy time.
import { buildSync } from 'esbuild'

buildSync({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'api/index.js',
  minify: true,
  treeShaking: true,
  // Packages that use UMD/dynamic require() patterns esbuild can't resolve.
  // nft will trace these from node_modules and include them in the function.
  external: [
    'jsonc-parser',        // UMD factory: t("./impl/format"), t("./impl/edit"), etc.
    '@sentry/node',        // Heavy CJS with native bindings
    '@sentry/profiling-node',
  ],
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
