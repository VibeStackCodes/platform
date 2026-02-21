import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { TooltipProvider } from '@/components/ui/tooltip'

interface RouterContext {
  auth: { isAuthenticated: boolean; user: unknown }
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <TooltipProvider>
      <div className="font-sans antialiased">
        <Outlet />
        {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
      </div>
    </TooltipProvider>
  ),
})
