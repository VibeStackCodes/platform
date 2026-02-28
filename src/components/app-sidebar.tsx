import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronsUpDown, LogOut, MessageSquare, PanelLeft, Plus, Search } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase-browser'
import { apiFetch } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'New project', icon: Plus, to: '/dashboard' as const },
  { label: 'Search', icon: Search, to: '/dashboard' as const },
] as const

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const { toggleSidebar, state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const { data: recentProjects } = useQuery({
    queryKey: ['recent-projects'],
    queryFn: async () => {
      const res = await apiFetch('/api/projects')
      if (!res.ok) return []
      const projects = await res.json()
      return (projects as Array<{ id: string; name: string }>).slice(0, 5)
    },
  })

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="group/logo"
                tooltip={isCollapsed ? 'Expand sidebar' : undefined}
                asChild={!isCollapsed}
                onClick={isCollapsed ? toggleSidebar : undefined}
              >
                {isCollapsed ? (
                  <div className="relative flex aspect-square size-8 items-center justify-center">
                    <img
                      src="/vibestack-logo.png"
                      alt="VibeStack"
                      className="size-8 transition-opacity group-hover/logo:opacity-0"
                    />
                    <PanelLeft className="absolute size-4 opacity-0 transition-opacity group-hover/logo:opacity-100" />
                  </div>
                ) : (
                  <Link to="/">
                    <div className="flex aspect-square size-8 items-center justify-center">
                      <img src="/vibestack-logo.png" alt="VibeStack" className="size-8" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">VibeStack</span>
                    </div>
                  </Link>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {!isCollapsed && <SidebarTrigger />}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentPath === item.to}
                    tooltip={item.label}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {recentProjects && recentProjects.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Recents</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recentProjects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={currentPath === `/project/${project.id}`}
                      tooltip={project.name}
                    >
                      <Link to="/project/$id" params={{ id: project.id }}>
                        <MessageSquare />
                        <span>{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function NavUser() {
  const { user } = useAuth()
  const { isMobile } = useSidebar()

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??'
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? 'User'

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs">{user?.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs">{user?.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
