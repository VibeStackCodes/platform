import type { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './supabase-browser'

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true'

const MOCK_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'mock@vibestack.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: { full_name: 'Mock User', plan: 'Pro Plan' },
  created_at: new Date().toISOString(),
} as unknown as User

export function useAuth() {
  const [user, setUser] = useState<User | null>(MOCK_MODE ? MOCK_USER : null)
  const [loading, setLoading] = useState(!MOCK_MODE)

  useEffect(() => {
    if (MOCK_MODE) return

    let mounted = true

    // onAuthStateChange is the single source of truth.
    // It fires once on subscribe with the current session (INITIAL_SESSION),
    // so we use that first event to set loading=false — no separate getUser() needed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { user, isAuthenticated: !!user, loading }
}
