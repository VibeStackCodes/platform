import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase-browser'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

/**
 * Handles Supabase auth redirects (email confirmation, OAuth, password reset).
 *
 * For implicit flow: `detectSessionInUrl` (configured on the Supabase client)
 * automatically extracts tokens from the URL hash fragment and persists them.
 * This route waits for the SIGNED_IN event, then redirects to /dashboard.
 *
 * For OAuth via server: the server route at /api/auth/callback handles
 * code exchange, but the final redirect lands here for the client to pick up
 * the session.
 */
function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        subscription.unsubscribe()
        navigate({ to: '/dashboard' })
      }
    })

    // Safety timeout — if auth state never fires, redirect to login
    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      navigate({ to: '/auth/login' })
    }, 5_000)

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-black to-zinc-900">
      <p className="text-zinc-400">Signing you in...</p>
    </div>
  )
}
