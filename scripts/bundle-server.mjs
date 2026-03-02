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
  // Provide a real require() for CJS packages bundled into ESM output.
  // esbuild replaces require() with a throwing __require() stub in ESM format —
  // any CJS package calling require("url"), require("events"), etc. will crash.
  // createRequire() restores Node.js built-in resolution for these calls.
  // Docs: https://github.com/evanw/esbuild/issues/1921
  //       https://github.com/aws/aws-sam-cli/issues/4827
  banner: {
    js: [
      '// Bundled by esbuild for Vercel serverless',
      "import { createRequire as __createRequire } from 'module';",
      "import { dirname as __bundleDirname } from 'path';",
      "import { fileURLToPath as __bundleFileURLToPath } from 'url';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __bundleFileURLToPath(import.meta.url);',
      'const __dirname = __bundleDirname(__filename);',
    ].join('\n'),
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
