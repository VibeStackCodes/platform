import { createRouter, RouterProvider } from '@tanstack/react-router'
import { createRootRoute, createRoute } from '@tanstack/react-router'

const rootRoute = createRootRoute()
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-white">
      <p className="text-lg font-medium text-neutral-300">Building your app...</p>
    </div>
  ),
})

const routeTree = rootRoute.addChildren([indexRoute])
const router = createRouter({ routeTree })

export default function App() {
  return <RouterProvider router={router} />
}
