---
name: supabase-js
description: Supabase client patterns for auth, typed queries, realtime, and storage in React apps
version: 1.0.0
tags:
  - supabase
  - database
  - auth
  - realtime
  - storage
---

# Supabase JS Client

Instructions for using @supabase/supabase-js in generated Vite + React 19 apps. Generated apps use Supabase REST API via the JS client (NOT direct Postgres connections).

## Client Setup

Always create a typed Supabase client singleton:

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
```

The `Database` type is generated from the database schema and provides full type safety for all queries.

## Authentication Patterns

### Sign Up

```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
    data: {
      full_name: 'John Doe',
      // Additional user metadata
    },
  },
})

if (error) {
  console.error('Sign up error:', error.message)
  return
}

// data.user contains the user object
// data.session may be null if email confirmation is required
```

### Sign In

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123',
})

if (error) {
  console.error('Sign in error:', error.message)
  return
}

// data.user and data.session are populated
```

### OAuth Sign In

```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
})

// Supported providers: github, google, gitlab, bitbucket, etc.
```

### Sign Out

```typescript
const { error } = await supabase.auth.signOut()

if (error) {
  console.error('Sign out error:', error.message)
}
```

### Auth State Hook

Create a custom hook for auth state management:

```typescript
// src/hooks/useAuth.ts
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, session, loading }
}
```

### Password Reset

```typescript
// Request reset
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/auth/reset-password`,
})

// Update password (called on reset page)
const { error } = await supabase.auth.updateUser({
  password: newPassword,
})
```

## Database Queries

**CRITICAL**: Always use the Supabase client query builder. NEVER use raw SQL from the client. Row Level Security (RLS) policies are enforced automatically.

### Select Queries

```typescript
// Single table select
const { data, error } = await supabase
  .from('posts')
  .select('*')

// Select specific columns
const { data, error } = await supabase
  .from('posts')
  .select('id, title, created_at')

// Select with relationships (foreign key joins)
const { data, error } = await supabase
  .from('posts')
  .select(`
    *,
    author:profiles(id, username, avatar_url),
    comments(id, content, created_at)
  `)

// Filtering
const { data, error } = await supabase
  .from('posts')
  .select('*')
  .eq('status', 'published')
  .gt('created_at', '2024-01-01')
  .order('created_at', { ascending: false })
  .limit(10)

// Single row
const { data, error } = await supabase
  .from('posts')
  .select('*')
  .eq('id', postId)
  .single()

// With count
const { data, error, count } = await supabase
  .from('posts')
  .select('*', { count: 'exact' })
  .eq('status', 'published')
```

### Insert

```typescript
const { data, error } = await supabase
  .from('posts')
  .insert({
    title: 'My Post',
    content: 'Post content...',
    status: 'draft',
  })
  .select()
  .single()

// Bulk insert
const { data, error } = await supabase
  .from('posts')
  .insert([
    { title: 'Post 1', content: 'Content 1' },
    { title: 'Post 2', content: 'Content 2' },
  ])
  .select()
```

### Update

```typescript
const { data, error } = await supabase
  .from('posts')
  .update({ status: 'published', published_at: new Date().toISOString() })
  .eq('id', postId)
  .select()
  .single()

// Conditional update
const { data, error } = await supabase
  .from('posts')
  .update({ views: 0 })
  .lt('created_at', '2023-01-01')
  .select()
```

### Delete

```typescript
const { error } = await supabase
  .from('posts')
  .delete()
  .eq('id', postId)

// Conditional delete
const { error } = await supabase
  .from('posts')
  .delete()
  .eq('status', 'draft')
  .lt('created_at', '2023-01-01')
```

### RPC (Stored Procedures)

```typescript
const { data, error } = await supabase
  .rpc('function_name', {
    param1: 'value1',
    param2: 42,
  })
```

## Realtime Subscriptions

Subscribe to database changes in real-time:

```typescript
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type Post = Database['public']['Tables']['posts']['Row']

function usePosts() {
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    // Initial fetch
    supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setPosts(data ?? []))

    // Subscribe to changes
    const channel = supabase
      .channel('posts-changes')
      .on<Post>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPosts((current) => [payload.new, ...current])
          } else if (payload.eventType === 'UPDATE') {
            setPosts((current) =>
              current.map((post) =>
                post.id === payload.new.id ? payload.new : post
              )
            )
          } else if (payload.eventType === 'DELETE') {
            setPosts((current) =>
              current.filter((post) => post.id !== payload.old.id)
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return posts
}
```

### Filtered Subscriptions

```typescript
const channel = supabase
  .channel('user-posts')
  .on<Post>(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'posts',
      filter: `user_id=eq.${userId}`,
    },
    (payload) => {
      // Handle changes
    }
  )
  .subscribe()
```

## Storage Operations

### Upload File

```typescript
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/avatar.png`, file, {
    cacheControl: '3600',
    upsert: true,
  })

if (error) {
  console.error('Upload error:', error.message)
  return
}

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('avatars')
  .getPublicUrl(data.path)
```

### Download File

```typescript
const { data, error } = await supabase.storage
  .from('documents')
  .download('path/to/file.pdf')

if (error) {
  console.error('Download error:', error.message)
  return
}

// data is a Blob
const url = URL.createObjectURL(data)
```

### List Files

```typescript
const { data, error } = await supabase.storage
  .from('documents')
  .list('folder', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  })
```

### Delete File

```typescript
const { error } = await supabase.storage
  .from('avatars')
  .remove(['path/to/file.png'])
```

### Signed URLs (Private Files)

```typescript
const { data, error } = await supabase.storage
  .from('private-files')
  .createSignedUrl('path/to/file.pdf', 60) // 60 seconds

if (error) {
  console.error('Signed URL error:', error.message)
  return
}

const { signedUrl } = data
```

## Type Safety

Always use the generated `Database` types:

```typescript
import type { Database } from '@/lib/database.types'

type Post = Database['public']['Tables']['posts']['Row']
type PostInsert = Database['public']['Tables']['posts']['Insert']
type PostUpdate = Database['public']['Tables']['posts']['Update']

// Typed query result
const { data } = await supabase
  .from('posts')
  .select('*')
  .eq('id', postId)
  .single()

// data is typed as Post | null
```

## Common Pitfalls

1. **Never use raw SQL from client**: Always use the query builder. RLS policies only work with the query builder.

2. **Don't forget error handling**: Every Supabase call returns `{ data, error }`. Always check for errors.

3. **RLS must be enabled**: Generated apps should have RLS enabled on all tables. Queries will fail if RLS policies aren't set up correctly.

4. **Auth state persistence**: The client automatically persists sessions in localStorage. Don't manually manage tokens.

5. **Realtime requires table replication**: Tables must have realtime enabled via `ALTER TABLE posts REPLICA IDENTITY FULL;`

6. **Foreign key joins**: Use the `select()` syntax with embedded queries, not multiple separate queries.

7. **Type imports**: Import types from `database.types`, not from `@supabase/supabase-js`.

8. **Environment variables**: Always prefix with `VITE_` for client-side access: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

9. **Subscription cleanup**: Always unsubscribe from realtime channels in cleanup functions to prevent memory leaks.

10. **File upload size limits**: Default limit is 50MB per file. Check bucket settings if larger files are needed.
