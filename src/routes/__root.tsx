import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import type { QueryClient } from '@tanstack/react-query'

interface RouterContext {
  auth: { isAuthenticated: boolean; user: unknown }
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <div className="dark font-sans antialiased">
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </div>
  ),
})
