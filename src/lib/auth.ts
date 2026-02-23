import type { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './supabase-browser'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
