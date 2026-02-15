---
name: tanstack-query
description: TanStack Query patterns for async state management in React apps
version: 1.0.0
tags:
  - tanstack
  - query
  - async
  - state-management
  - react
---

# TanStack Query

Instructions for using TanStack Query (React Query) in generated Vite + React 19 apps. TanStack Query provides powerful async state management with caching, automatic refetching, and optimistic updates.

## Setup

### QueryClient Configuration

```typescript
// src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

### Provider Setup

```typescript
// src/main.tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from './lib/query-client'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

## Query Patterns

### Basic Query

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type Post = Database['public']['Tables']['posts']['Row']

function PostsList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Post[]
    },
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <ul>
      {data.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

### Query with Parameters

```typescript
function PostDetail({ postId }: { postId: string }) {
  const { data: post, isLoading } = useQuery({
    queryKey: ['posts', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single()

      if (error) throw error
      return data as Post
    },
  })

  if (isLoading) return <div>Loading...</div>

  return (
    <div>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </div>
  )
}
```

### Dependent Queries

```typescript
function UserPosts({ userId }: { userId: string }) {
  // First query
  const { data: user } = useQuery({
    queryKey: ['users', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      return data
    },
  })

  // Second query depends on first
  const { data: posts } = useQuery({
    queryKey: ['posts', { userId }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', userId)

      if (error) throw error
      return data
    },
    enabled: !!user, // Only run when user is loaded
  })

  return (
    <div>
      <h2>{user?.name}'s Posts</h2>
      {posts?.map((post) => (
        <div key={post.id}>{post.title}</div>
      ))}
    </div>
  )
}
```

### Paginated Queries

```typescript
function PaginatedPosts() {
  const [page, setPage] = useState(1)
  const pageSize = 10

  const { data, isLoading, isFetching, isPreviousData } = useQuery({
    queryKey: ['posts', { page, pageSize }],
    queryFn: async () => {
      const offset = (page - 1) * pageSize

      const { data, error, count } = await supabase
        .from('posts')
        .select('*', { count: 'exact' })
        .range(offset, offset + pageSize - 1)
        .order('created_at', { ascending: false })

      if (error) throw error

      return {
        posts: data,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      }
    },
    placeholderData: (previousData) => previousData, // Keep previous data while fetching
  })

  return (
    <div>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <>
          <ul>
            {data.posts.map((post) => (
              <li key={post.id}>{post.title}</li>
            ))}
          </ul>
          <div>
            <button
              onClick={() => setPage((old) => Math.max(old - 1, 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span>
              Page {page} of {data.totalPages}
            </span>
            <button
              onClick={() => {
                if (!isPreviousData && page < data.totalPages) {
                  setPage((old) => old + 1)
                }
              }}
              disabled={page >= data.totalPages}
            >
              Next
            </button>
          </div>
          {isFetching && <span>Refreshing...</span>}
        </>
      )}
    </div>
  )
}
```

### Infinite Queries

```typescript
import { useInfiniteQuery } from '@tanstack/react-query'

function InfinitePosts() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['posts', 'infinite'],
    queryFn: async ({ pageParam = 0 }) => {
      const pageSize = 10
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .range(pageParam, pageParam + pageSize - 1)
        .order('created_at', { ascending: false })

      if (error) throw error

      return {
        posts: data,
        nextCursor: data.length === pageSize ? pageParam + pageSize : undefined,
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
  })

  return (
    <div>
      {data?.pages.map((page, i) => (
        <div key={i}>
          {page.posts.map((post) => (
            <div key={post.id}>{post.title}</div>
          ))}
        </div>
      ))}
      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage
          ? 'Loading more...'
          : hasNextPage
          ? 'Load More'
          : 'Nothing more to load'}
      </button>
    </div>
  )
}
```

### Suspense Query

```typescript
import { useSuspenseQuery } from '@tanstack/react-query'

function PostDetail({ postId }: { postId: string }) {
  // No loading state needed - Suspense handles it
  const { data: post } = useSuspenseQuery({
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
  })

  return (
    <div>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </div>
  )
}

// Usage with Suspense boundary
function PostPage({ postId }: { postId: string }) {
  return (
    <Suspense fallback={<div>Loading post...</div>}>
      <PostDetail postId={postId} />
    </Suspense>
  )
}
```

## Mutation Patterns

### Basic Mutation

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'

function CreatePost() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (newPost: { title: string; content: string }) => {
      const { data, error } = await supabase
        .from('posts')
        .insert(newPost)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    mutation.mutate({
      title: formData.get('title') as string,
      content: formData.get('content') as string,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Title" />
      <textarea name="content" placeholder="Content" />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create Post'}
      </button>
      {mutation.isError && <p>Error: {mutation.error.message}</p>}
      {mutation.isSuccess && <p>Post created!</p>}
    </form>
  )
}
```

### Optimistic Updates

```typescript
function UpdatePost({ postId }: { postId: string }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (updates: { title?: string; content?: string }) => {
      const { data, error } = await supabase
        .from('posts')
        .update(updates)
        .eq('id', postId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onMutate: async (newPost) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['posts', postId] })

      // Snapshot previous value
      const previousPost = queryClient.getQueryData(['posts', postId])

      // Optimistically update
      queryClient.setQueryData(['posts', postId], (old: Post) => ({
        ...old,
        ...newPost,
      }))

      // Return context with snapshot
      return { previousPost }
    },
    onError: (err, newPost, context) => {
      // Rollback on error
      if (context?.previousPost) {
        queryClient.setQueryData(['posts', postId], context.previousPost)
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['posts', postId] })
    },
  })

  return (
    <button onClick={() => mutation.mutate({ title: 'New Title' })}>
      Update Title
    </button>
  )
}
```

### Delete Mutation

```typescript
function DeletePost({ postId }: { postId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)

      if (error) throw error
    },
    onSuccess: () => {
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      // Remove specific item from cache
      queryClient.removeQueries({ queryKey: ['posts', postId] })
      // Navigate away
      navigate({ to: '/posts' })
    },
  })

  return (
    <button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      {mutation.isPending ? 'Deleting...' : 'Delete Post'}
    </button>
  )
}
```

## Cache Management

### Manual Cache Updates

```typescript
const queryClient = useQueryClient()

// Get cached data
const post = queryClient.getQueryData(['posts', postId])

// Set cached data
queryClient.setQueryData(['posts', postId], newPost)

// Update cached data
queryClient.setQueryData(['posts', postId], (old: Post) => ({
  ...old,
  views: old.views + 1,
}))

// Remove from cache
queryClient.removeQueries({ queryKey: ['posts', postId] })

// Invalidate (mark as stale)
queryClient.invalidateQueries({ queryKey: ['posts'] })

// Refetch immediately
queryClient.refetchQueries({ queryKey: ['posts'] })
```

### Prefetching

```typescript
function PostsList() {
  const queryClient = useQueryClient()

  const { data: posts } = useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('posts').select('*')
      if (error) throw error
      return data
    },
  })

  const prefetchPost = (postId: string) => {
    queryClient.prefetchQuery({
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
      staleTime: 1000 * 60, // 1 minute
    })
  }

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id} onMouseEnter={() => prefetchPost(post.id)}>
          <Link to="/posts/$id" params={{ id: post.id }}>
            {post.title}
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

## Query Key Conventions

Always use consistent query key structures:

```typescript
// ✅ Good query keys
['posts']                          // All posts
['posts', { status: 'published' }] // Filtered posts
['posts', postId]                  // Single post
['posts', postId, 'comments']      // Post comments
['users', userId]                  // Single user
['users', userId, 'posts']         // User's posts

// ❌ Bad query keys
['getPosts']                       // Don't include action verbs
['post-123']                       // Use array notation
[postId]                           // Always start with entity name
```

## Custom Hooks

Create reusable query hooks:

```typescript
// src/hooks/use-posts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type Post = Database['public']['Tables']['posts']['Row']
type PostInsert = Database['public']['Tables']['posts']['Insert']

export function usePosts() {
  return useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Post[]
    },
  })
}

export function usePost(postId: string) {
  return useQuery({
    queryKey: ['posts', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single()

      if (error) throw error
      return data as Post
    },
    enabled: !!postId,
  })
}

export function useCreatePost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newPost: PostInsert) => {
      const { data, error } = await supabase
        .from('posts')
        .insert(newPost)
        .select()
        .single()

      if (error) throw error
      return data as Post
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}

export function useUpdatePost(postId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Partial<Post>) => {
      const { data, error } = await supabase
        .from('posts')
        .update(updates)
        .eq('id', postId)
        .select()
        .single()

      if (error) throw error
      return data as Post
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', postId] })
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })
}

export function useDeletePost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)

      if (error) throw error
    },
    onSuccess: (_, postId) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.removeQueries({ queryKey: ['posts', postId] })
    },
  })
}
```

## Common Pitfalls

1. **Query key consistency**: Always use the same query key structure for the same data. Inconsistent keys lead to cache misses.

2. **Mutation invalidation**: Always invalidate affected queries after mutations, or data won't refresh.

3. **Optimistic rollback**: In optimistic updates, always return context from `onMutate` and use it in `onError` for rollback.

4. **Enabled queries**: Use `enabled: false` or `enabled: !!dependency` to prevent queries from running prematurely.

5. **Stale time vs gc time**: `staleTime` controls when data is considered stale (triggers background refetch). `gcTime` controls when unused data is removed from cache.

6. **Parallel queries**: Multiple `useQuery` calls in the same component run in parallel automatically.

7. **Suspense boundaries**: `useSuspenseQuery` requires a parent `<Suspense>` boundary or the app will crash.

8. **Manual refetch**: Use `queryClient.invalidateQueries()`, not `queryClient.refetchQueries()`, unless you need immediate refetch.

9. **Query keys with objects**: Objects in query keys are compared by value, not reference. `{ status: 'published' }` works correctly.

10. **Mutation state**: Access mutation state via `mutation.isPending`, `mutation.isError`, `mutation.isSuccess`, not by tracking separate state.
