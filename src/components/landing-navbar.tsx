import { Link } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export function LandingNavbar() {
  const { user } = useAuth()

  return (
    <nav className="sticky top-0 z-50 bg-transparent">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Logo */}
        <Link to="/" className="flex items-center">
          <img src="/vibestack-logo.png" alt="VibeStack" className="h-7 w-auto" />
        </Link>

        {/* Right: Auth actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <Button variant="default" size="sm" className="rounded-full" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <Button size="sm" className="rounded-full" asChild>
              <Link to="/auth/login">Login</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}
