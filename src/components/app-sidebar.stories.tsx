/**
 * AppSidebar — context-heavy story
 *
 * AppSidebar requires ALL of the following at runtime:
 *   - SidebarProvider        from @/components/ui/sidebar (useSidebar())
 *   - useRouterState()       from @tanstack/react-router
 *   - useQuery()             from @tanstack/react-query (recent projects)
 *   - useAuth()              from @/lib/auth (Supabase user)
 *   - useTheme()             from @/components/theme-provider
 *   - supabase.auth.signOut  from @/lib/supabase-browser
 *
 * Strategy:
 *   - SidebarProvider, ThemeProvider and QueryClientProvider are injected via
 *     decorators — they're pure React context so they work fine.
 *   - useRouterState() and useAuth() call React context that does NOT exist in
 *     Storybook, so AppSidebar will throw when the story mounts.
 *
 * What's provided here:
 *   - Decorator wiring so the visual shell can be developed in isolation once
 *     router + auth mocking is added (see StaticSidebar below).
 *   - A StaticSidebar stand-in that mirrors the sidebar's visual structure
 *     without any runtime context requirements.
 *
 * To make AppSidebar stories fully functional add:
 *   1. storybook-addon-react-router-v6 (or equivalent for TanStack Router)
 *   2. A mock AuthContext provider that returns { user: fakeUser }
 *   3. QueryClient with pre-seeded 'recent-projects' query data
 */
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LayoutGrid, Plus } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import type { Decorator } from '@storybook/react'
import { ThemeProvider } from './theme-provider'

const withThemeProvider: Decorator = (Story) => (
  <ThemeProvider defaultTheme="light">
    <Story />
  </ThemeProvider>
)

// ---------------------------------------------------------------------------
// Static sidebar stand-in (no context required)
// ---------------------------------------------------------------------------

interface StaticSidebarProps {
  recentProjects?: Array<{ id: string; name: string; age: string }>
  collapsed?: boolean
}

function StaticSidebar({
  recentProjects = [],
}: StaticSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                <img src="/vibestack-logo.png" alt="VibeStack" className="size-8" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">VibeStack</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="New project">
                  <Plus />
                  <span>New project</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Projects">
                  <LayoutGrid />
                  <span>Projects</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {recentProjects.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Recents
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recentProjects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton className="justify-between" tooltip={project.name}>
                      <span className="truncate">{project.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground/50">{project.age}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold">
                JD
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-[13px] font-medium">jane.doe</span>
                <span className="truncate text-[11px] text-muted-foreground/60">Free Plan</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})

const meta = {
  title: 'VibeStack/AppSidebar',
  component: StaticSidebar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
**AppSidebar** depends on \`useRouterState()\`, \`useAuth()\`, \`useSidebar()\`,
\`useQuery()\`, and \`useTheme()\`.

These stories use a **StaticSidebar** stand-in that renders the same DOM structure
without those context requirements.  To enable the real component in stories:

1. Add a TanStack Router storybook decorator
2. Provide a mock \`AuthContext\` (user + signOut)
3. Pre-seed the \`recent-projects\` query in QueryClient
        `.trim(),
      },
    },
  },
  decorators: [
    withThemeProvider,
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <Story />
          <main className="flex-1 p-6">
            <p className="text-muted-foreground text-sm">Main content area</p>
          </main>
        </SidebarProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof StaticSidebar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    recentProjects: [
      { id: '1', name: 'E-commerce Dashboard', age: '2h' },
      { id: '2', name: 'Blog Platform', age: '1d' },
      { id: '3', name: 'Task Manager', age: '3d' },
    ],
  },
}

export const NoRecentProjects: Story = {
  args: {
    recentProjects: [],
  },
}

export const ManyProjects: Story = {
  args: {
    recentProjects: [
      { id: '1', name: 'E-commerce Dashboard', age: '2h' },
      { id: '2', name: 'Blog Platform', age: '1d' },
      { id: '3', name: 'Task Manager', age: '3d' },
      { id: '4', name: 'Analytics Tool', age: '5d' },
      { id: '5', name: 'API Documentation Site', age: '1mo' },
    ],
  },
}

export const LongProjectNames: Story = {
  args: {
    recentProjects: [
      { id: '1', name: 'A Very Long Project Name That Should Truncate Gracefully', age: '2h' },
      { id: '2', name: 'Another Extremely Long Title For The Sidebar Test', age: '4d' },
    ],
  },
}
