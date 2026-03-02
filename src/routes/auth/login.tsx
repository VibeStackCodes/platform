import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase-browser'
import { apiFetch } from '@/lib/utils'

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
})

const PENDING_PROMPT_KEY = 'vibestack_pending_prompt'

/**
 * Wait for Supabase to fully persist the session in localStorage.
 * `signUp`/`signInWithPassword` resolve before `onAuthStateChange` fires,
 * so `getSession()` may return stale data if called immediately.
 * This waits for the `SIGNED_IN` event — the official signal that the
 * session is stored and ready for use by `apiFetch`.
 * Times out after 5s to prevent the UI from hanging indefinitely.
 */
function waitForSession(): Promise<void> {
  return new Promise((resolve) => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        subscription.unsubscribe()
        clearTimeout(timeout)
        resolve()
      }
    })

    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      resolve()
    }, 5_000)
  })
}

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function redirectAfterAuth() {
    const pendingPrompt = sessionStorage.getItem(PENDING_PROMPT_KEY)
    if (pendingPrompt) {
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pendingPrompt.slice(0, 80),
          prompt: pendingPrompt,
        }),
      })
      if (res.ok) {
        sessionStorage.removeItem(PENDING_PROMPT_KEY)
        const project = await res.json()
        if (project?.id) {
          navigate({ to: '/project/$id', params: { id: project.id } })
          return
        }
      }
      // API failed — keep prompt in sessionStorage so next login attempt retries
    }
    navigate({ to: '/dashboard' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        console.error('[signup] Supabase error:', error.message, error.status)
        setError(error.message)
      } else if (data.session && data.user) {
        await waitForSession()
        await redirectAfterAuth()
      } else {
        setMessage('Check your email for a confirmation link.')
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setError('Invalid email or password.')
      } else if (data.user) {
        await waitForSession()
        await redirectAfterAuth()
      }
    }

    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-black to-zinc-900">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-white">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </CardTitle>
          <CardDescription className="text-zinc-400">
            {isSignUp ? 'Sign up to start building with AI' : 'Sign in to your account'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-zinc-300">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                required
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-zinc-300">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                required
                minLength={6}
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {message && <p className="text-sm text-green-400">{message}</p>}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Button>
          </form>

          <div className="text-center text-sm text-zinc-400">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError(null)
                setMessage(null)
              }}
              className="text-white underline underline-offset-4 hover:text-zinc-300"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
