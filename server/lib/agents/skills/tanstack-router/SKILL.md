---
name: tanstack-router
description: File-based routing patterns for TanStack Router in Vite + React apps
version: 1.0.0
tags:
  - routing
  - tanstack
  - navigation
  - react
---

# TanStack Router

Instructions for using TanStack Router in generated Vite + React 19 apps. TanStack Router provides type-safe, file-based routing with powerful data loading and search param management.

## Project Structure

File-based routing using the `src/routes/` directory:

```
src/
  routes/
    __root.tsx           # Root layout (wraps all routes)
    index.tsx            # Home page (/)
    about.tsx            # About page (/about)
    _authenticated/      # Route group (not in URL)
      route.tsx          # Layout + auth guard
      dashboard.tsx      # /dashboard
      profile.tsx        # /profile
      settings.tsx       # /settings
    posts/
      index.tsx          # /posts (list)
      $id.tsx            # /posts/:id (detail)
      new.tsx            # /posts/new
    auth/
      login.tsx          # /auth/login
      signup.tsx         # /auth/signup
```

## Route File Patterns

### Root Layout

```typescript
// src/routes/__root.tsx
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <>
      <div className="min-h-screen">
        <Outlet />
      </div>
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}
```

### Index Route

```typescript
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div>
      <h1>Welcome</h1>
    </div>
  )
}
```

### Static Route

```typescript
// src/routes/about.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})

function AboutPage() {
  return (
    <div>
      <h1>About</h1>
    </div>
  )
}
```

### Dynamic Route (Path Params)

```typescript
// src/routes/posts/$id.tsx
import { createFileRoute } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type Post = Database['public']['Tables']['posts']['Row']

export const Route = createFileRoute('/posts/$id')({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) throw error
    return { post: data }
  },
  component: PostDetailPage,
})

function PostDetailPage() {
  const { post } = Route.useLoaderData()

  return (
    <div>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </div>
  )
}
```

### Route with Search Params

```typescript
// src/routes/posts/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

const postsSearchSchema = z.object({
  page: z.number().int().positive().catch(1),
  pageSize: z.number().int().positive().catch(10),
  search: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

export const Route = createFileRoute('/posts/')({
  validateSearch: postsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps: search }) => {
    const offset = (search.page - 1) * search.pageSize

    let query = supabase
      .from('posts')
      .select('*', { count: 'exact' })
      .range(offset, offset + search.pageSize - 1)
      .order('created_at', { ascending: false })

    if (search.search) {
      query = query.ilike('title', `%${search.search}%`)
    }

    if (search.status) {
      query = query.eq('status', search.status)
    }

    const { data, error, count } = await query

    if (error) throw error

    return {
      posts: data,
      total: count ?? 0,
    }
  },
  component: PostsPage,
})

function PostsPage() {
  const { posts, total } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  const handlePageChange = (page: number) => {
    navigate({
      search: (prev) => ({ ...prev, page }),
    })
  }

  const handleSearchChange = (searchTerm: string) => {
    navigate({
      search: (prev) => ({ ...prev, search: searchTerm, page: 1 }),
    })
  }

  return (
    <div>
      <h1>Posts ({total})</h1>
      <input
        type="text"
        value={search.search ?? ''}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search posts..."
      />
      <ul>
        {posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      <button onClick={() => handlePageChange(search.page - 1)}>
        Previous
      </button>
      <span>Page {search.page}</span>
      <button onClick={() => handlePageChange(search.page + 1)}>
        Next
      </button>
    </div>
  )
}
```

### Layout Route (Route Groups)

```typescript
// src/routes/_authenticated/route.tsx
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      throw redirect({
        to: '/auth/login',
        search: {
          redirect: location.href,
        },
      })
    }

    return { session }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <div>
      <nav>
        {/* Navigation for authenticated users */}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
```

### Child Route with Inherited Data

```typescript
// src/routes/_authenticated/dashboard.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  // Access parent loader data
  const { session } = Route.useRouteContext()

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {session.user.email}</p>
    </div>
  )
}
```

## Navigation

### Link Component

```typescript
import { Link } from '@tanstack/react-router'

function Navigation() {
  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>
      <Link to="/posts" search={{ page: 1 }}>
        Posts
      </Link>
      <Link
        to="/posts/$id"
        params={{ id: '123' }}
      >
        Post Detail
      </Link>
      <Link
        to="/posts"
        search={(prev) => ({ ...prev, status: 'published' })}
        activeProps={{ className: 'font-bold' }}
      >
        Published Posts
      </Link>
    </nav>
  )
}
```

### Programmatic Navigation

```typescript
import { useNavigate } from '@tanstack/react-router'

function MyComponent() {
  const navigate = useNavigate()

  const handleClick = () => {
    // Navigate to a route
    navigate({ to: '/posts' })

    // Navigate with params
    navigate({ to: '/posts/$id', params: { id: '123' } })

    // Navigate with search params
    navigate({ to: '/posts', search: { page: 2 } })

    // Update search params only
    navigate({ search: (prev) => ({ ...prev, page: 2 }) })

    // Go back
    navigate({ to: '..', from: '/posts/123' })
  }

  return <button onClick={handleClick}>Navigate</button>
}
```

## Data Loading

### Basic Loader

```typescript
export const Route = createFileRoute('/posts/$id')({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) throw error
    return { post: data }
  },
  component: PostPage,
})
```

### Loader with Dependencies

```typescript
export const Route = createFileRoute('/posts/')({
  loaderDeps: ({ search }) => ({
    page: search.page,
    status: search.status,
  }),
  loader: async ({ deps }) => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('status', deps.status)
      .range((deps.page - 1) * 10, deps.page * 10 - 1)

    if (error) throw error
    return { posts: data }
  },
})
```

### Error Handling

```typescript
export const Route = createFileRoute('/posts/$id')({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) throw error
    return { post: data }
  },
  errorComponent: ({ error }) => {
    return (
      <div>
        <h1>Error Loading Post</h1>
        <p>{error.message}</p>
      </div>
    )
  },
  component: PostPage,
})
```

### Pending Component

```typescript
export const Route = createFileRoute('/posts/$id')({
  loader: async ({ params }) => {
    // Slow loader
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('id', params.id)
      .single()
    return { post: data }
  },
  pendingComponent: () => <div>Loading post...</div>,
  component: PostPage,
})
```

## Route Context

### Setting Context

```typescript
// src/routes/_authenticated/route.tsx
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    return {
      session,
      profile,
    }
  },
})
```

### Accessing Context

```typescript
// src/routes/_authenticated/dashboard.tsx
function DashboardPage() {
  const { session, profile } = Route.useRouteContext()

  return (
    <div>
      <h1>Welcome, {profile.full_name}</h1>
      <p>{session.user.email}</p>
    </div>
  )
}
```

## Search Params Validation

Always validate search params with Zod:

```typescript
import { z } from 'zod'

const searchSchema = z.object({
  page: z.number().int().positive().catch(1),
  sort: z.enum(['asc', 'desc']).catch('desc'),
  filter: z.string().optional(),
})

export const Route = createFileRoute('/items')({
  validateSearch: searchSchema,
  component: ItemsPage,
})

function ItemsPage() {
  const search = Route.useSearch()
  // search is fully typed: { page: number, sort: 'asc' | 'desc', filter?: string }
}
```

## Common Hooks

```typescript
import {
  useNavigate,
  useParams,
  useSearch,
  useRouteContext,
  useRouter,
  useMatches,
} from '@tanstack/react-router'

function MyComponent() {
  // Navigate programmatically
  const navigate = useNavigate()

  // Access route params
  const params = useParams({ from: '/posts/$id' })

  // Access search params
  const search = useSearch({ from: '/posts/' })

  // Access route context
  const context = useRouteContext({ from: '/_authenticated/dashboard' })

  // Access router instance
  const router = useRouter()

  // Access matched routes
  const matches = useMatches()
}
```

## Common Pitfalls

1. **Missing `createFileRoute` path**: The path in `createFileRoute('/path')` must match the file's location in `src/routes/`.

2. **Underscore prefix for layouts**: Use `_name` for layout routes that shouldn't appear in the URL (e.g., `_authenticated`).

3. **Search param validation**: Always use `validateSearch` with Zod schemas for type-safe search params.

4. **Loader dependencies**: Use `loaderDeps` when the loader depends on search params to ensure re-execution on param changes.

5. **Auth guards in `beforeLoad`**: Use `beforeLoad` for authentication checks, not in the component body.

6. **Type-safe params**: Use `params` from the loader, not from `useParams()` in the component, for better type inference.

7. **Error boundaries**: Always provide `errorComponent` for routes with loaders that might fail.

8. **Route context vs loader data**: Use `beforeLoad` return for context shared with child routes, `loader` return for route-specific data.

9. **Navigation with search params**: Use the function form `search: (prev) => ({ ...prev, newKey: value })` to preserve existing params.

10. **File naming**: `$id.tsx` for dynamic params, `index.tsx` for index routes, `route.tsx` for layout-only routes.
