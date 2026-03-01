/**
 * LandingNavbar — auth + router context story
 *
 * LandingNavbar calls:
 *   - useAuth()  from @/lib/auth    (Supabase onAuthStateChange subscription)
 *   - <Link>     from @tanstack/react-router
 *
 * Both hooks throw or produce no-op values when their providers are absent.
 * These stories use a static HTML stand-in that matches the rendered output so
 * the visual design can be reviewed without wiring up full auth / router mocks.
 *
 * To make a fully interactive story, add:
 *   1. A mock AuthContext provider that returns { user: null } or a fake user
 *   2. A MemoryRouter or storybook-addon-router decorator
 */
import type { Meta, StoryObj } from '@storybook/react'

/**
 * StaticNavbar renders the visual output of LandingNavbar without requiring
 * auth or router context.  It mirrors the exact DOM structure of the real
 * component.
 */
function StaticNavbar({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  return (
    <nav className="sticky top-0 z-50 bg-transparent">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Logo */}
        <a href="/" className="flex items-center">
          <img src="/vibestack-logo.png" alt="VibeStack" className="h-7 w-auto" />
        </a>

        {/* Right: Auth actions */}
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <a
              href="/dashboard"
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            >
              Dashboard
            </a>
          ) : (
            <a
              href="/auth/login"
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            >
              Login
            </a>
          )}
        </div>
      </div>
    </nav>
  )
}

const meta = {
  title: 'VibeStack/LandingNavbar',
  component: StaticNavbar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
**LandingNavbar** uses \`useAuth()\` (Supabase) and \`<Link>\` (TanStack Router).
These stories render a **StaticNavbar** stand-in that is visually identical but
does not require those runtime contexts.

To test the real component you need:
- A mock \`AuthContext\` provider returning \`{ user: null | fakeUser }\`
- A TanStack Router \`MemoryRouter\` or storybook-addon-router decorator
        `.trim(),
      },
    },
  },
} satisfies Meta<typeof StaticNavbar>

export default meta
type Story = StoryObj<typeof meta>

export const LoggedOut: Story = {
  args: {
    isLoggedIn: false,
  },
  decorators: [
    (Story) => (
      <div className="min-h-[120px] bg-background">
        <Story />
      </div>
    ),
  ],
}

export const LoggedIn: Story = {
  args: {
    isLoggedIn: true,
  },
  decorators: [
    (Story) => (
      <div className="min-h-[120px] bg-background">
        <Story />
      </div>
    ),
  ],
}

export const OnDarkHero: Story = {
  args: {
    isLoggedIn: false,
  },
  decorators: [
    (Story) => (
      <div className="min-h-[120px] bg-neutral-950">
        <Story />
      </div>
    ),
  ],
}
