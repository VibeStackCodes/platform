---
name: react-19
description: React 19 patterns including use() hook, ref as prop, and new concurrent features
version: 1.0.0
tags:
  - react
  - hooks
  - concurrent
  - suspense
---

# React 19

Instructions for using React 19 in generated Vite + React apps. React 19 introduces new hooks, removes legacy patterns, and improves concurrent rendering.

## Breaking Changes from React 18

### No More `forwardRef`

Refs are now regular props. No need for `forwardRef`:

```typescript
// ❌ React 18 pattern (deprecated)
import { forwardRef } from 'react'

const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  return <input ref={ref} {...props} />
})

// ✅ React 19 pattern
type InputProps = {
  ref?: React.Ref<HTMLInputElement>
} & React.ComponentPropsWithoutRef<'input'>

function Input({ ref, ...props }: InputProps) {
  return <input ref={ref} {...props} />
}

// Or with type inference
function Input(props: React.ComponentProps<'input'>) {
  return <input {...props} />
}
```

### Context as Promise

No more `Context.Provider` wrapper needed:

```typescript
// ❌ React 18 pattern
import { createContext } from 'react'

const ThemeContext = createContext<Theme | null>(null)

function App() {
  return (
    <ThemeContext.Provider value={theme}>
      <Component />
    </ThemeContext.Provider>
  )
}

// ✅ React 19 pattern
import { createContext } from 'react'

const ThemeContext = createContext<Theme | null>(null)

function App() {
  return (
    <ThemeContext value={theme}>
      <Component />
    </ThemeContext>
  )
}
```

## New `use()` Hook

The `use()` hook reads resources like Promises and Context:

### Reading Promises

```typescript
import { use, Suspense } from 'react'

function PostDetail({ postPromise }: { postPromise: Promise<Post> }) {
  // use() suspends until the promise resolves
  const post = use(postPromise)

  return (
    <div>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </div>
  )
}

function PostPage({ postId }: { postId: string }) {
  // Create promise outside component for stable reference
  const postPromise = fetchPost(postId)

  return (
    <Suspense fallback={<div>Loading post...</div>}>
      <PostDetail postPromise={postPromise} />
    </Suspense>
  )
}
```

### Reading Context

```typescript
import { use, createContext } from 'react'

const ThemeContext = createContext<'light' | 'dark'>('light')

function ThemedButton() {
  // use() can read context
  const theme = use(ThemeContext)

  return (
    <button className={theme === 'dark' ? 'dark-button' : 'light-button'}>
      Click me
    </button>
  )
}

function App() {
  return (
    <ThemeContext value="dark">
      <ThemedButton />
    </ThemeContext>
  )
}
```

### Conditional `use()`

Unlike other hooks, `use()` can be called conditionally:

```typescript
function Post({ postId }: { postId?: string }) {
  let post = null

  if (postId) {
    // ✅ Conditional use() is allowed
    post = use(fetchPost(postId))
  }

  if (!post) {
    return <div>No post selected</div>
  }

  return <div>{post.title}</div>
}
```

## Server Components Pattern (for reference)

Generated apps are **client-only** (Vite SPA), but understanding the pattern helps:

```typescript
// This pattern is for Next.js App Router, NOT Vite apps
// Shown for reference only

// ❌ Don't use in generated apps - Vite apps are client-only
async function PostPage({ params }: { params: { id: string } }) {
  // Server Components can be async
  const post = await fetchPost(params.id)

  return (
    <div>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </div>
  )
}
```

For Vite apps, use TanStack Router loaders or React Query instead.

## `useOptimistic` Hook

Optimistic updates for better UX during mutations:

```typescript
import { useOptimistic } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

function PostLikes({ post }: { post: Post }) {
  const queryClient = useQueryClient()

  // Optimistic state
  const [optimisticLikes, setOptimisticLikes] = useOptimistic(
    post.likes,
    (currentLikes, newLikes: number) => newLikes
  )

  const likeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .update({ likes: post.likes + 1 })
        .eq('id', post.id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', post.id] })
    },
  })

  const handleLike = () => {
    // Update optimistic state immediately
    setOptimisticLikes(optimisticLikes + 1)
    // Trigger actual mutation
    likeMutation.mutate()
  }

  return (
    <button onClick={handleLike} disabled={likeMutation.isPending}>
      {optimisticLikes} likes
    </button>
  )
}
```

## `useTransition` Updates

Better handling of non-urgent updates:

```typescript
import { useTransition, useState } from 'react'

function SearchPosts() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Post[]>([])
  const [isPending, startTransition] = useTransition()

  const handleSearch = (value: string) => {
    // Update input immediately (urgent)
    setQuery(value)

    // Search in background (non-urgent)
    startTransition(async () => {
      const { data } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', `%${value}%`)

      setResults(data ?? [])
    })
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search posts..."
      />
      {isPending && <div>Searching...</div>}
      <ul>
        {results.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  )
}
```

## `useActionState` Hook

Form actions with pending state (replaces `useFormStatus` in React 18):

```typescript
import { useActionState } from 'react'

type State = {
  message: string
  error?: string
}

async function createPost(prevState: State, formData: FormData): Promise<State> {
  const title = formData.get('title') as string
  const content = formData.get('content') as string

  const { error } = await supabase.from('posts').insert({
    title,
    content,
  })

  if (error) {
    return { message: '', error: error.message }
  }

  return { message: 'Post created successfully!' }
}

function CreatePostForm() {
  const [state, formAction, isPending] = useActionState(createPost, {
    message: '',
  })

  return (
    <form action={formAction}>
      <input name="title" placeholder="Title" required />
      <textarea name="content" placeholder="Content" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
      {state.error && <p className="text-red-600">{state.error}</p>}
      {state.message && <p className="text-green-600">{state.message}</p>}
    </form>
  )
}
```

## Enhanced Suspense

### Multiple Suspense Boundaries

```typescript
import { Suspense } from 'react'

function PostPage({ postId }: { postId: string }) {
  return (
    <div>
      {/* Separate boundaries for independent loading states */}
      <Suspense fallback={<PostHeaderSkeleton />}>
        <PostHeader postId={postId} />
      </Suspense>

      <Suspense fallback={<PostContentSkeleton />}>
        <PostContent postId={postId} />
      </Suspense>

      <Suspense fallback={<CommentsSkeleton />}>
        <Comments postId={postId} />
      </Suspense>
    </div>
  )
}
```

### Nested Suspense

```typescript
function Dashboard() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <div>
        <Header />

        <Suspense fallback={<ChartsSkeleton />}>
          <Charts />
        </Suspense>

        <Suspense fallback={<TableSkeleton />}>
          <DataTable />
        </Suspense>
      </div>
    </Suspense>
  )
}
```

## Error Boundaries

React 19 improves error boundary patterns:

```typescript
import { Component, ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div>
            <h2>Something went wrong</h2>
            <p>{this.state.error?.message}</p>
            <button onClick={() => this.setState({ hasError: false })}>
              Try again
            </button>
          </div>
        )
      )
    }

    return this.props.children
  }
}

// Usage
function App() {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Suspense fallback={<Loading />}>
        <Dashboard />
      </Suspense>
    </ErrorBoundary>
  )
}
```

## Concurrent Rendering

### `useDeferredValue`

Defer non-urgent updates:

```typescript
import { useDeferredValue, useState } from 'react'

function SearchResults() {
  const [query, setQuery] = useState('')
  // Defer the search query for non-urgent rendering
  const deferredQuery = useDeferredValue(query)

  const { data: results } = useQuery({
    queryKey: ['posts', 'search', deferredQuery],
    queryFn: async () => {
      if (!deferredQuery) return []

      const { data } = await supabase
        .from('posts')
        .select('*')
        .ilike('title', `%${deferredQuery}%`)

      return data ?? []
    },
  })

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      {/* Input is always responsive */}
      {query !== deferredQuery && <div>Searching...</div>}
      <ul>
        {results?.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  )
}
```

### `startTransition`

Mark updates as non-urgent:

```typescript
import { startTransition, useState } from 'react'

function TabsComponent() {
  const [tab, setTab] = useState('posts')

  const handleTabChange = (newTab: string) => {
    startTransition(() => {
      // This update is non-urgent
      setTab(newTab)
    })
  }

  return (
    <div>
      <button onClick={() => handleTabChange('posts')}>Posts</button>
      <button onClick={() => handleTabChange('comments')}>Comments</button>

      {tab === 'posts' && <PostsList />}
      {tab === 'comments' && <CommentsList />}
    </div>
  )
}
```

## Automatic Batching

React 19 automatically batches all state updates:

```typescript
function Counter() {
  const [count, setCount] = useState(0)
  const [flag, setFlag] = useState(false)

  const handleClick = () => {
    // These are automatically batched in React 19
    // (even in async functions, timeouts, etc.)
    setCount((c) => c + 1)
    setFlag((f) => !f)
    // Only one re-render
  }

  const handleAsync = async () => {
    await someAsyncOperation()
    // Still batched even after await
    setCount((c) => c + 1)
    setFlag((f) => !f)
  }

  return <button onClick={handleClick}>Count: {count}</button>
}
```

## Custom Hooks Best Practices

### With `use()` Hook

```typescript
import { use } from 'react'

function usePost(postPromise: Promise<Post>) {
  const post = use(postPromise)
  return post
}

// Usage
function PostDetail() {
  const postPromise = fetchPost('123')
  const post = usePost(postPromise)

  return <div>{post.title}</div>
}
```

### With React Query

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

function usePosts() {
  return useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
  })
}

function usePost(postId: string) {
  return useQuery({
    queryKey: ['posts', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!postId,
  })
}
```

## Type Safety Patterns

### Component Props

```typescript
// Intrinsic element props
type ButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'secondary'
}

function Button({ variant = 'primary', ...props }: ButtonProps) {
  return <button {...props} className={`btn-${variant}`} />
}

// With ref
type InputProps = React.ComponentProps<'input'> & {
  label?: string
}

function Input({ label, ...props }: InputProps) {
  return (
    <div>
      {label && <label>{label}</label>}
      <input {...props} />
    </div>
  )
}
```

### Children Types

```typescript
type CardProps = {
  children: React.ReactNode
  title?: string
}

function Card({ children, title }: CardProps) {
  return (
    <div>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  )
}
```

## Common Pitfalls

1. **No `forwardRef` needed**: Refs are regular props in React 19. Remove all `forwardRef` usage.

2. **`use()` requires Suspense**: Always wrap components using `use()` with a `<Suspense>` boundary.

3. **`use()` in conditionals**: Unlike other hooks, `use()` CAN be called conditionally.

4. **Context Provider**: Use `<Context value={...}>` not `<Context.Provider value={...}>`.

5. **Promise stability**: Create promises outside components or use `useMemo` to avoid recreating on every render.

6. **Automatic batching**: State updates are always batched, no need for `ReactDOM.flushSync()` in most cases.

7. **`useOptimistic` rollback**: Optimistic state automatically reverts if the component re-renders with new props.

8. **`startTransition` with async**: Can't use `async/await` directly inside `startTransition`, wrap the async logic separately.

9. **Server Components**: Vite apps are client-only. Don't use async components or Server Component patterns.

10. **Error boundaries**: Still need class components for error boundaries. No hooks-based alternative yet.
