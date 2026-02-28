/** Simulated terminal output with ANSI escape codes */

export const buildOutput = `\x1b[36mvite build\x1b[0m

\x1b[2mvite v5.4.0 building for production...\x1b[0m
\x1b[32m✓\x1b[0m 47 modules transformed.

\x1b[1mdist/client/index.html\x1b[0m                     0.72 kB
\x1b[1mdist/client/assets/index-Bv8NzNkj.css\x1b[0m     62.41 kB │ gzip:  11.72 kB
\x1b[1mdist/client/assets/index-DiwrgTda.js\x1b[0m     342.12 kB │ gzip: 110.35 kB

\x1b[32m✓ built in 2.43s\x1b[0m`

export const errorOutput = `\x1b[36mbun run build\x1b[0m

\x1b[33m> tsc -b && vite build\x1b[0m

\x1b[31merror TS2345:\x1b[0m Argument of type 'string' is not assignable to parameter of type 'number'.
  \x1b[2msrc/components/Counter.tsx:12:15\x1b[0m

  \x1b[31m✗\x1b[0m Build failed with 1 error

\x1b[31mProcess exited with code 1\x1b[0m`

export const installOutput = `\x1b[36mbun add react-query zustand\x1b[0m

\x1b[2mbun add v1.1.3\x1b[0m

\x1b[32m+ react-query@5.28.0\x1b[0m
\x1b[32m+ zustand@4.5.2\x1b[0m

\x1b[32m2 packages installed\x1b[0m \x1b[2m[634ms]\x1b[0m`

export const streamingOutput = `\x1b[36mvite\x1b[0m

  \x1b[32mLocal\x1b[0m:   http://localhost:5173/
  \x1b[32mNetwork\x1b[0m: http://192.168.1.100:5173/

  \x1b[2mpress h + enter to show help\x1b[0m

\x1b[32m✓\x1b[0m [ready] Server is running`

export const longOutput = Array.from({ length: 40 }, (_, i) =>
  `[${String(i).padStart(2, '0')}:${String((i * 137) % 60).padStart(2, '0')}.${String((i * 379) % 1000).padStart(3, '0')}] ${
    i % 5 === 0
      ? `\x1b[33mWARN\x1b[0m Processing file ${i + 1}/40...`
      : `\x1b[2mDEBUG\x1b[0m Compiled module-${i + 1}.ts`
  }`
).join('\n')
