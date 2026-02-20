import { Link } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export function LandingNavbar() {
  const { user } = useAuth()

  return (
    <nav className="sticky top-0 z-50 border-b border-border/40 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-primary" aria-hidden="true" />
          <span className="text-lg font-semibold tracking-tight">VibeStack</span>
        </Link>

        {/* Right: Auth actions */}
        <div className="flex items-center gap-2">
          {user ? (
            <Button variant="default" size="sm" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <Button variant="default" size="sm" className="rounded-full" asChild>
              <Link to="/auth/login">Create Free Account</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}
