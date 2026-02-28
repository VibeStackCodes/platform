import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  CreditCard,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Sun,
  SunMoon,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase-browser'
import { useTheme } from '@/components/theme-provider'
import { apiFetch } from '@/lib/utils'

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  return `${months}mo`
}

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
      return (
        projects as Array<{ id: string; name: string; updatedAt: string }>
      ).slice(0, 5)
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
                      <img
                        src="/vibestack-logo.png"
                        alt="VibeStack"
                        className="size-8"
                      />
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
        {/* Top actions: New project + Search */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="New project">
                  <Link to="/dashboard">
                    <Plus />
                    <span>New project</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Projects">
                  <Link to="/dashboard">
                    <LayoutGrid />
                    <span>Projects</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!isCollapsed && <SidebarSeparator/>}


        {/* Recents with relative timestamps — hidden when sidebar collapsed */}
        {recentProjects && recentProjects.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Recents
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recentProjects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={currentPath === `/project/${project.id}`}
                      tooltip={project.name}
                      className="justify-between"
                    >
                      <Link to="/project/$id" params={{ id: project.id }}>
                        <span className="truncate">{project.name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground/50">
                          {relativeTime(project.updatedAt)}
                        </span>
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
  const { theme, setTheme } = useTheme()

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??'
  const displayName =
    user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'
  const plan = user?.user_metadata?.plan ?? 'Free Plan'

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-7 w-7 rounded-full">
                <AvatarFallback className="rounded-full bg-sidebar-accent text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-[13px] font-medium">
                  {displayName}
                </span>
                <span className="truncate text-[11px] text-muted-foreground/60">
                  {plan}
                </span>
              </div>
              <ChevronDown className="ml-auto size-4 text-muted-foreground/50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-xl"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SunMoon className="size-4" />
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="rounded-xl">
                  <DropdownMenuRadioGroup
                    value={theme}
                    onValueChange={(v) =>
                      setTheme(v as 'system' | 'light' | 'dark')
                    }
                  >
                    <DropdownMenuRadioItem value="system">
                      <Monitor className="size-4" />
                      System
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="light">
                      <Sun className="size-4" />
                      Light
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      <Moon className="size-4" />
                      Dark
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/dashboard">
                <CreditCard className="size-4" />
                View all plans
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
