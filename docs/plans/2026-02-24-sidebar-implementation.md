# Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Lovable-style collapsible sidebar to dashboard pages using shadcn/ui Sidebar component.

**Architecture:** Restructure routes so `_authenticated/_dashboard/route.tsx` wraps dashboard pages with `SidebarProvider` + `AppSidebar` + `SidebarInset`. Builder route stays outside, no sidebar. shadcn Sidebar with `collapsible="icon"` provides the icon-rail toggle.

**Tech Stack:** shadcn/ui Sidebar, TanStack Router layout routes, Lucide icons, existing oklch CSS tokens.

**Design doc:** `docs/plans/2026-02-24-sidebar-design.md`

---

### Task 1: Install shadcn Sidebar component

**Files:**
- Modified by CLI: `src/components/ui/sidebar.tsx` (created by shadcn)
- Modified by CLI: `package.json` (if new deps needed)

**Step 1: Install the sidebar component**

Run: `bunx shadcn@latest add sidebar`

This installs the full sidebar component system: `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`, `SidebarInset`, `useSidebar` hook.

**Step 2: Verify the component was installed**

Run: `ls src/components/ui/sidebar.tsx`
Expected: file exists

**Step 3: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/components/ui/sidebar.tsx package.json bun.lockb
git commit -m "feat: add shadcn/ui sidebar component"
```

---

### Task 2: Restructure routes for sidebar layout

Move `dashboard.tsx` into `_dashboard/` pathless layout directory. The URL `/dashboard` stays unchanged — `_dashboard` prefix means no URL segment.

**Files:**
- Create: `src/routes/_authenticated/_dashboard/route.tsx`
- Move: `src/routes/_authenticated/dashboard.tsx` → `src/routes/_authenticated/_dashboard/dashboard.tsx`

**Step 1: Create the `_dashboard` directory**

Run: `mkdir -p src/routes/_authenticated/_dashboard`

**Step 2: Move dashboard into the layout directory**

Run: `mv src/routes/_authenticated/dashboard.tsx src/routes/_authenticated/_dashboard/dashboard.tsx`

**Step 3: Update the `createFileRoute` path in the moved file**

The route path must match the new filesystem location. Edit `src/routes/_authenticated/_dashboard/dashboard.tsx`:

Change:
```tsx
export const Route = createFileRoute('/_authenticated/dashboard')({
```
To:
```tsx
export const Route = createFileRoute('/_authenticated/_dashboard/dashboard')({
```

**Step 4: Create the sidebar layout route**

Create `src/routes/_authenticated/_dashboard/route.tsx`:

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'

export const Route = createFileRoute('/_authenticated/_dashboard')({
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
```

Note: This will NOT compile yet — `AppSidebar` doesn't exist. That's Task 3.

**Step 5: Regenerate route tree**

Run: `bunx tsc --noEmit` (TanStack Router Vite plugin auto-regenerates `routeTree.gen.ts` on file changes, but running tsc validates)

If the route tree doesn't auto-regenerate, run: `bun run dev` briefly and stop it, or check `routeTree.gen.ts` manually.

**Step 6: Commit**

```bash
git add src/routes/_authenticated/_dashboard/ src/routeTree.gen.ts
git rm src/routes/_authenticated/dashboard.tsx 2>/dev/null || true
git commit -m "refactor: move dashboard into _dashboard layout route"
```

---

### Task 3: Create AppSidebar component

**Files:**
- Create: `src/components/app-sidebar.tsx`

**Step 1: Create the AppSidebar component**

Create `src/components/app-sidebar.tsx`:

```tsx
import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronsUpDown, FolderOpen, Home, LogOut, Plus } from 'lucide-react'
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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase-browser'

const NAV_ITEMS = [
  { label: 'Home', icon: Home, to: '/dashboard' as const },
  { label: 'All Projects', icon: FolderOpen, to: '/dashboard' as const },
] as const

export function AppSidebar() {
  const { user } = useAuth()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??'
  const displayName = user?.user_metadata?.full_name ?? user?.email ?? 'User'

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                align="start"
                side="right"
                sideOffset={4}
              >
                <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => supabase.auth.signOut()}
                >
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
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
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="New Project">
              <Link to="/">
                <Plus />
                <span>New Project</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
```

Note: This uses `Avatar` from shadcn — if not installed, we'll need to add it. Check if it exists.

**Step 2: Check if Avatar component exists, install if needed**

Run: `ls src/components/ui/avatar.tsx 2>/dev/null || bunx shadcn@latest add avatar`

**Step 3: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/components/app-sidebar.tsx src/components/ui/avatar.tsx
git commit -m "feat: add AppSidebar component with nav items and user menu"
```

---

### Task 4: Add SidebarTrigger to dashboard header

The sidebar needs a toggle button visible in the main content area. Add `SidebarTrigger` to the dashboard page header.

**Files:**
- Modify: `src/routes/_authenticated/_dashboard/dashboard.tsx`

**Step 1: Add SidebarTrigger to the dashboard page**

Edit `src/routes/_authenticated/_dashboard/dashboard.tsx` — add the trigger to the header row:

Replace the opening of the return JSX:
```tsx
<div className="container mx-auto p-8">
  <div className="mb-8 flex items-center justify-between">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
```

With:
```tsx
<div className="flex-1 p-8">
  <div className="mb-8 flex items-center justify-between">
    <div className="flex items-center gap-3">
      <SidebarTrigger className="-ml-1" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
```

Add closing `</div>` for the new wrapper div, and add the import:
```tsx
import { SidebarTrigger } from '@/components/ui/sidebar'
```

Also change `container mx-auto p-8` to `flex-1 p-8` since `SidebarInset` already handles the content area layout — a `container` class would fight with it.

**Step 2: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/routes/_authenticated/_dashboard/dashboard.tsx
git commit -m "feat: add SidebarTrigger to dashboard header"
```

---

### Task 5: Verify sidebar styling with existing dark theme

The CSS tokens for sidebar already exist in `src/index.css` (lines 76-83 for light, 110-117 for dark). Verify the sidebar renders correctly with the existing theme.

**Files:**
- Possibly modify: `src/index.css` (only if sidebar background needs adjustment)

**Step 1: Run the dev server and visually verify**

Run: `bun run dev`

Check at `http://localhost:5173/dashboard` (logged in):
- Sidebar renders on the left with expanded state
- User avatar + name in header
- Home and All Projects nav items visible
- New Project button in footer
- Click toggle or press `Cmd+B` → collapses to icon rail
- Tooltips appear on hover in collapsed mode
- Sign out dropdown works

**Step 2: Verify dark mode specifically**

If using dark mode (class `dark` on `<html>`), confirm sidebar uses the dark tokens:
- `--sidebar: oklch(0.205 0 0)` (dark surface)
- `--sidebar-accent: oklch(0.269 0 0)` (hover/active)

If the sidebar background doesn't match the overall dark theme, adjust the tokens in `src/index.css`.

**Step 3: Run lint**

Run: `bun run lint`
Expected: 0 errors

**Step 4: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 5: Run tests**

Run: `bun run test`
Expected: all pass (dashboard page moved but behavior unchanged)

**Step 6: Commit if any CSS adjustments were made**

```bash
git add src/index.css
git commit -m "style: adjust sidebar tokens for dark theme"
```

---

### Task 6: Update any stale links to /dashboard

Check if any links in the codebase point to `/dashboard` via TanStack Router `to` prop — they should still work since the URL hasn't changed, but verify.

**Files:**
- Check: `src/components/landing-navbar.tsx` (has `<Link to="/dashboard">`)
- Check: `src/routes/_authenticated/route.tsx` (auth guard)
- Check: any other files referencing `/dashboard`

**Step 1: Search for dashboard references**

Run: `grep -rn '/dashboard' src/`

Verify all `<Link to="/dashboard">` references still work. The URL `/dashboard` is unchanged — only the file location moved. The route tree auto-regeneration handles this.

**Step 2: Verify the auth redirect still works**

The auth guard in `_authenticated/route.tsx` redirects to `/auth/login` when not authenticated. When authenticated, it renders `<Outlet />` which now includes the `_dashboard` layout route. No changes needed.

**Step 3: Verify builder page is unaffected**

Navigate to `/project/some-id` — should render the builder UI with NO sidebar, same as before.

**Step 4: Final commit**

If any link updates were needed:
```bash
git add -A
git commit -m "fix: update stale dashboard route references"
```

---

## Summary of File Changes

| Action | File | Purpose |
|--------|------|---------|
| Install | `src/components/ui/sidebar.tsx` | shadcn Sidebar component system |
| Install | `src/components/ui/avatar.tsx` | Avatar for user display |
| Create | `src/routes/_authenticated/_dashboard/route.tsx` | Sidebar layout wrapper |
| Create | `src/components/app-sidebar.tsx` | Custom sidebar with nav items |
| Move | `dashboard.tsx` → `_dashboard/dashboard.tsx` | Nest under sidebar layout |
| Modify | `_dashboard/dashboard.tsx` | Add SidebarTrigger, adjust container class |
| Auto-gen | `src/routeTree.gen.ts` | Regenerated by TanStack Router plugin |
| Verify | `src/index.css` | Existing sidebar CSS tokens (may need tweaks) |

## Verification Checklist

- [ ] `bunx tsc --noEmit` passes
- [ ] `bun run lint` passes
- [ ] `bun run test` passes
- [ ] Sidebar renders expanded with nav items at `/dashboard`
- [ ] `Cmd+B` toggles to icon rail
- [ ] Tooltips show on hover in collapsed mode
- [ ] User dropdown with sign out works
- [ ] `/project/:id` renders WITHOUT sidebar
- [ ] Landing page `/` renders WITHOUT sidebar
