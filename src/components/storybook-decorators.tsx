import type { Decorator } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SidebarProvider } from './ui/sidebar'
import { ThemeProvider } from './theme-provider'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})

export const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={queryClient}>
    <Story />
  </QueryClientProvider>
)

export const withSidebar: Decorator = (Story) => (
  <SidebarProvider>
    <Story />
    <main className="flex-1" />
  </SidebarProvider>
)

export const withThemeProvider: Decorator = (Story) => (
  <ThemeProvider defaultTheme="light">
    <Story />
  </ThemeProvider>
)
