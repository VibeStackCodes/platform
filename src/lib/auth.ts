import type { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from './supabase-browser'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          console.error('[auth] getUser failed:', error.message)
          setUser(null)
        } else {
          setUser(data.user)
        }
        setLoading(false)
      })
      .catch(() => {
        if (mounted) {
          setUser(null)
          setLoading(false)
        }
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { user, isAuthenticated: !!user, loading }
}
