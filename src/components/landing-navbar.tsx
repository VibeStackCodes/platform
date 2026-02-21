import { Link } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export function LandingNavbar() {
  const { user } = useAuth()

  return (
    <nav className="sticky top-0 z-50 bg-black/30 backdrop-blur-lg border-b border-white/10">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="size-7 rounded-md bg-gradient-to-br from-purple-600 to-blue-600 shadow-sm group-hover:shadow-md transition-shadow" aria-hidden="true" />
          <span className="text-lg font-semibold tracking-tight text-white">VibeStack</span>
        </Link>

        {/* Right: Auth actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <Button variant="default" size="sm" className="rounded-full bg-purple-700 hover:bg-purple-800 text-white" asChild>
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <Button
              size="sm"
              className="rounded-full bg-gradient-to-r from-purple-700 to-blue-700 hover:from-purple-800 hover:to-blue-800 text-white font-medium shadow-lg hover:shadow-xl transition-all"
              asChild
            >
              <Link to="/auth/login">Create Free Account</Link>
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}
