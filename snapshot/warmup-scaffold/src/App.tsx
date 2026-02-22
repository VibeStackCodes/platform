import { createRouter, RouterProvider, createRootRoute, createRoute } from '@tanstack/react-router'
// Warmup imports — trigger Vite dep pre-bundling for shadcn/ui dependencies
// These are tree-shaken in production but force Vite to pre-bundle radix-ui, lucide-react, cva
import '@/components/ui/button'
import '@/components/ui/dialog'
import '@/components/ui/select'
import '@/components/ui/command'

const rootRoute = createRootRoute()
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-white">
      <p className="text-lg font-medium text-neutral-300">Your app will show up here once built</p>
    </div>
  ),
})

const routeTree = rootRoute.addChildren([indexRoute])
const router = createRouter({ routeTree })

export default function App() {
  return <RouterProvider router={router} />
}
