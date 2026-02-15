---
name: vite-app
description: Vite project structure, configuration, and build patterns for React apps
version: 1.0.0
tags:
  - vite
  - build
  - dev-server
  - react
---

# Vite App Structure

Instructions for structuring and configuring Vite + React 19 apps. Generated apps use Vite 7+ as the build tool and dev server.

## Project Structure

Standard directory layout for generated apps:

```
project-root/
├── src/
│   ├── main.tsx              # App entry point
│   ├── index.css             # Global CSS + Tailwind imports
│   ├── routes/               # TanStack Router file-based routes
│   │   ├── __root.tsx        # Root layout
│   │   ├── index.tsx         # Home page (/)
│   │   ├── _authenticated/   # Auth guard layout
│   │   │   ├── route.tsx     # Layout component + beforeLoad
│   │   │   ├── dashboard.tsx # /dashboard
│   │   │   └── profile.tsx   # /profile
│   │   └── auth/
│   │       ├── login.tsx     # /auth/login
│   │       └── signup.tsx    # /auth/signup
│   ├── components/
│   │   ├── ui/               # shadcn/ui components (vendored)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── header.tsx
│   │   │   ├── footer.tsx
│   │   │   └── sidebar.tsx
│   │   └── features/         # Feature-specific components
│   │       ├── post-card.tsx
│   │       └── user-avatar.tsx
│   ├── hooks/                # Custom React hooks
│   │   ├── use-auth.ts
│   │   ├── use-posts.ts
│   │   └── use-theme.ts
│   ├── lib/                  # Utilities and clients
│   │   ├── supabase.ts       # Supabase client singleton
│   │   ├── utils.ts          # cn() helper, etc.
│   │   ├── database.types.ts # Generated Supabase types
│   │   └── query-client.ts   # TanStack Query configuration
│   ├── contexts/             # React contexts
│   │   └── theme-context.tsx
│   └── types/                # TypeScript type definitions
│       └── index.ts
├── public/                   # Static assets (copied to dist/)
│   ├── favicon.ico
│   └── images/
├── index.html                # HTML entry point
├── vite.config.ts            # Vite configuration
├── tsconfig.json             # TypeScript config
├── tsconfig.node.json        # TypeScript config for Vite config files
├── package.json              # Dependencies and scripts
└── bun.lockb                 # Bun lockfile
```

## Entry Point

### HTML Entry (`index.html`)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App Name</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**CRITICAL**: The HTML file is in the project root, NOT in `public/`. Vite uses this as the entry point.

### JavaScript Entry (`src/main.tsx`)

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query-client'
import { routeTree } from './routeTree.gen'
import './index.css'

// Create router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: {
    queryClient,
  },
})

// Type augmentation for router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
)
```

## Vite Configuration

### Basic Configuration (`vite.config.ts`)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router-vendor': ['@tanstack/react-router'],
          'query-vendor': ['@tanstack/react-query'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
```

### Plugin Order

Plugin order matters:
1. `TanStackRouterVite()` - First (generates route tree)
2. `react()` - Second (React transform)
3. `tailwindcss()` - Third (CSS processing)

### Path Alias

```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
}
```

This enables `@/components/ui/button` imports instead of relative paths.

## TypeScript Configuration

### Main Config (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Path mapping */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

### Node Config (`tsconfig.node.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

## Environment Variables

### Client-Side Variables

**CRITICAL**: Only variables prefixed with `VITE_` are exposed to the client.

```bash
# .env.local
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ❌ NOT accessible in client code
DATABASE_URL=postgresql://...
```

### Accessing Environment Variables

```typescript
// ✅ Client-side access
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ❌ Will be undefined in client
const databaseUrl = import.meta.env.DATABASE_URL

// Check mode
const isDev = import.meta.env.DEV
const isProd = import.meta.env.PROD
const mode = import.meta.env.MODE // 'development' | 'production'
```

### Type Safety for Environment Variables

```typescript
// src/env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SENTRY_DSN?: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

## Package.json Scripts

Standard scripts for generated apps:

```json
{
  "name": "app-name",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-router": "^1.91.0",
    "@tanstack/react-query": "^5.62.0",
    "@supabase/supabase-js": "^2.48.1",
    "@radix-ui/react-dialog": "^1.1.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.5",
    "zod": "^3.24.1",
    "react-hook-form": "^7.54.2",
    "@hookform/resolvers": "^3.9.1",
    "sonner": "^1.7.1"
  },
  "devDependencies": {
    "@types/react": "^19.0.6",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "@tanstack/router-plugin": "^1.91.0",
    "@tailwindcss/vite": "^4.0.11",
    "typescript": "~5.7.2",
    "vite": "^7.0.0",
    "eslint": "^9.17.0",
    "prettier": "^3.4.2"
  }
}
```

## Development Workflow

### Starting Dev Server

```bash
bun run dev
```

Starts Vite dev server with:
- Hot Module Replacement (HMR)
- Fast refresh for React components
- Instant server start
- On-demand file compilation
- Port 3000 (configurable in `vite.config.ts`)

### Building for Production

```bash
bun run build
```

This runs two commands:
1. `tsc -b` - TypeScript type checking
2. `vite build` - Production build

Output: `dist/` directory with optimized assets.

### Preview Production Build

```bash
bun run preview
```

Serves the production build locally for testing.

## Build Optimization

### Code Splitting

Vite automatically code-splits routes when using dynamic imports:

```typescript
// Automatic code splitting with TanStack Router
// Each route file becomes its own chunk
```

Manual code splitting:

```typescript
import { lazy, Suspense } from 'react'

const HeavyComponent = lazy(() => import('./components/HeavyComponent'))

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HeavyComponent />
    </Suspense>
  )
}
```

### Vendor Chunks

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom'],
        'router-vendor': ['@tanstack/react-router'],
        'query-vendor': ['@tanstack/react-query'],
        'supabase-vendor': ['@supabase/supabase-js'],
        'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
      },
    },
  },
}
```

### Asset Optimization

```typescript
build: {
  assetsInlineLimit: 4096, // Inline assets < 4kb as base64
  cssCodeSplit: true,      // Split CSS per chunk
  sourcemap: true,          // Generate source maps
}
```

## Static Assets

### Public Directory

Files in `public/` are copied as-is to `dist/`:

```
public/
  favicon.ico     → dist/favicon.ico
  images/
    logo.svg      → dist/images/logo.svg
```

Reference in code:

```tsx
// ✅ Correct - root-relative path
<img src="/images/logo.svg" alt="Logo" />

// ❌ Wrong - don't include "public"
<img src="/public/images/logo.svg" alt="Logo" />
```

### Import Assets

Assets in `src/` can be imported:

```typescript
// Import returns optimized URL
import logo from './assets/logo.svg'

function Header() {
  return <img src={logo} alt="Logo" />
}
```

### Image Optimization

```typescript
// Small images are inlined as base64
import smallIcon from './icons/check.svg'
// Returns: data:image/svg+xml;base64,...

// Large images get hashed filenames
import hero from './images/hero.png'
// Returns: /assets/hero.a3b2c1d4.png
```

## CSS Handling

### Global CSS

```css
/* src/index.css */
@import "tailwindcss";

/* Global styles */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
}
```

Import in `main.tsx`:

```typescript
import './index.css'
```

### CSS Modules

```css
/* src/components/Card.module.css */
.card {
  border-radius: 8px;
  padding: 16px;
}

.title {
  font-size: 24px;
  font-weight: bold;
}
```

```typescript
import styles from './Card.module.css'

function Card({ title }: { title: string }) {
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
    </div>
  )
}
```

## Hot Module Replacement

HMR is automatic for:
- React components (Fast Refresh)
- CSS files
- Static assets

Preserve state during HMR:

```typescript
// State is preserved during HMR
function Counter() {
  const [count, setCount] = useState(0)

  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

## Common Pitfalls

1. **HTML location**: `index.html` is in the root directory, NOT in `public/` or `src/`.

2. **Environment variables**: Only `VITE_` prefixed variables are accessible in client code via `import.meta.env`.

3. **No `process.env`**: Use `import.meta.env` instead. Node.js-style `process.env` doesn't exist in Vite.

4. **Path alias setup**: Requires both `vite.config.ts` (resolve.alias) AND `tsconfig.json` (paths) configuration.

5. **Public directory**: Files in `public/` are served at root, not at `/public/`. Use `/favicon.ico`, not `/public/favicon.ico`.

6. **Build command**: Always run `tsc -b && vite build` to type-check before building. Vite doesn't type-check by default.

7. **Plugin order**: TanStack Router plugin must come before React plugin.

8. **Import extensions**: Can use `.ts`/`.tsx` extensions in imports (unlike Node.js). Vite handles them.

9. **Base path**: If deploying to a subdirectory, set `base: '/subdirectory/'` in `vite.config.ts`.

10. **SSR**: Generated apps are client-only (SPA). Don't use Vite SSR features or Node.js APIs in client code.
