# Lovable-style Sidebar — Design

**Date**: 2026-02-24
**Status**: Approved

## Goal

Add a collapsible sidebar to authenticated dashboard pages, matching Lovable's icon-rail + expanded panel pattern.

## Scope

- Sidebar on **dashboard pages only** — builder (`project.$id.tsx`) keeps its own layout
- Minimal MVP nav items: Home, All Projects, New Project
- Collapsible to icon-only rail (`Cmd+B` toggle)
- State persisted via cookie

## Approach

Use shadcn/ui's `Sidebar` component system (`collapsible="icon"` mode).

## Architecture

### Route restructure

```
_authenticated/
  route.tsx                    ← Auth guard (unchanged)
  _dashboard/
    route.tsx                  ← NEW: Sidebar layout wrapper
    index.tsx                  ← Moved from dashboard.tsx
  project.$id.tsx              ← Builder (no sidebar, unchanged)
```

`_dashboard/route.tsx` wraps all nested routes with `SidebarProvider` + `AppSidebar` + `SidebarInset` + `<Outlet />`.

### New components

| Component | Purpose |
|-----------|---------|
| `src/components/app-sidebar.tsx` | Composes sidebar nav: header (user avatar + dropdown), content (nav items), footer (credits) |

### shadcn/ui components to install

- `sidebar` (includes SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, SidebarInset, etc.)

### Existing components used

- `Tooltip` — icon-rail labels when collapsed
- `Button` — user avatar
- `DropdownMenu` — sign-out menu
- `Separator` — visual grouping

## Navigation Items

| Icon | Label | Route | Notes |
|------|-------|-------|-------|
| Home | Home | `/_dashboard` | Active state on index |
| FolderOpen | All Projects | `/_dashboard` | Same route for MVP |
| Plus | New Project | `/` | Links to landing prompt |

## Collapsible Behavior

- `collapsible="icon"` → 48px icon rail
- `SidebarTrigger` with built-in `Cmd+B`
- Cookie: `sidebar_state` (expanded/collapsed)
- Tooltips on hover in collapsed mode

## Styling

- Dark theme using existing oklch CSS variables
- `--sidebar-background`, `--sidebar-accent` mapped to VibeStack tokens
- Smooth width transition (built into shadcn Sidebar)

## Future Enhancements (not in scope)

- Search
- Recent/starred project lists
- Discover/Templates sections
- Share/referral CTA
- Upgrade CTA
