# Claude UI Redesign — Design Document

**Date**: 2026-02-27
**Branch**: `feature/claude-ui`
**Status**: In progress — pending Figma mockup generation and final approval

## Goal

Redesign VibeStack's authenticated experience (Dashboard + Builder) to match Claude.ai's design language — both visually and structurally. Landing page and auth pages remain unchanged.

## Design Decisions (Approved)

### Scope
- **In scope**: Dashboard, Builder (chat + preview), Sidebar, all authenticated UI
- **Out of scope**: Landing page, login/signup page

### Visual Identity: "Spirit, Not Skin"
Adopt Claude's warm-neutral design philosophy with VibeStack's own palette:
- Warm-tinted neutrals (slight chroma on warm axis) instead of current achromatic palette
- Violet/indigo accent from the existing landing page identity (not Claude's terracotta)
- Warm cream backgrounds instead of pure white
- Warm dark mode (brown-black tint, not cold grey)

### Layout: Artifacts-Style Builder
- Chat is **centered** (max-w-3xl) by default — spacious, reading-focused
- Preview panel **slides out from the right** when agent creates/edits files (like Claude's artifacts)
- Preview panel is dismissible (X button), not permanently split
- Sidebar **open by default** with project list (like Claude's conversation list)

### Component Patterns
- User messages: warm-tinted background bubble, rounded corners
- Assistant messages: no background bubble — plain text on page background
- Input bar: large, rounded (16px radius), bottom-fixed, model selector as chip
- Buttons: pill-shaped primary CTAs, rounded secondary
- Preview panel: tabs for Preview | Code, smooth slide-in animation

---

## Reference: Claude.ai Design System

### Official Brand Colors
| Name | Hex | Usage |
|------|-----|-------|
| Dark | `#141413` | Primary text, dark backgrounds |
| Light | `#faf9f5` | Main background (cream/off-white) |
| Mid Gray | `#b0aea5` | Secondary/muted elements |
| Light Gray | `#e8e6dc` | Subtle backgrounds, borders |
| Orange (Terracotta) | `#d97757` | Primary accent |
| Blue | `#6a9bcc` | Secondary accent |
| Green | `#788c5d` | Tertiary accent |

### Typography
- **Body**: Styrene B (narrow grotesque sans-serif) — commercial font
- **Display**: Galaxie Copernicus (transitional serif)
- **Supporting**: Tiempo Text (small-size serif)

### Layout Dimensions
- Sidebar: ~267px width, collapsible
- Chat column: max-w-3xl (768px), centered
- Artifacts panel: ~50% of remaining space, slides from right
- Input composer: border-radius 16px (rounded-2xl)
- Message bubbles: border-radius 18-20px

### Dark Mode
- Warm near-black background (~`#1c1c1a` to `#262624`)
- Sidebar slightly darker (~`#171715`)
- Terracotta accent persists
- "Evening conversation, not cold terminal"

### Spacing
- 8px grid (4px/8px rhythm)
- Message padding: ~24px horizontal
- Between-message spacing: ~16-24px
- Minimal shadows — flat with subtle depth

---

## Proposed VibeStack Palette (OKLCH)

### Light Mode
| Token | Value | Description |
|-------|-------|-------------|
| `--background` | `oklch(0.98 0.005 80)` | Warm cream (inspired by `#faf9f5`) |
| `--foreground` | `oklch(0.15 0.01 80)` | Warm near-black |
| `--primary` | `oklch(0.55 0.20 280)` | Violet-indigo accent (from landing identity) |
| `--primary-foreground` | `oklch(0.98 0.005 80)` | Light text on accent |
| `--muted` | `oklch(0.95 0.005 80)` | Warm light gray (sidebar bg, hover) |
| `--muted-foreground` | `oklch(0.50 0.01 80)` | Medium warm gray |
| `--border` | `oklch(0.90 0.005 80)` | Warm border |
| `--card` | `oklch(0.97 0.005 80)` | Card background |
| `--input` | `oklch(0.92 0.005 80)` | Input background |

### Dark Mode
| Token | Value | Description |
|-------|-------|-------------|
| `--background` | `oklch(0.15 0.005 80)` | Warm near-black |
| `--foreground` | `oklch(0.95 0.005 80)` | Warm off-white |
| `--primary` | `oklch(0.65 0.20 280)` | Violet-indigo (lightened for dark bg) |
| `--muted` | `oklch(0.22 0.005 80)` | Warm dark gray |
| `--muted-foreground` | `oklch(0.60 0.01 80)` | Medium warm gray |
| `--border` | `oklch(0.28 0.005 80)` | Warm dark border |
| `--card` | `oklch(0.20 0.005 80)` | Card dark bg |

### Typography (Accessible Alternatives)
- **Body**: DM Sans (or keep Inter) — warm, rounded, similar feel to Styrene B
- **Display**: DM Serif Display (already in project — matches Galaxie Copernicus feel)
- **Mono**: System monospace stack (unchanged)

### Border Radius
- Base `--radius`: `0.75rem` (12px)
- Input composer: `1rem` (16px)
- Message bubbles: `1.25rem` (20px)
- CTA buttons: `9999px` (pill)

---

## Layout Wireframes

### Dashboard
```
┌─────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌─────────────────────────────────────┐  │
│  │ SIDEBAR  │  │          MAIN CONTENT               │  │
│  │ (~260px) │  │                                     │  │
│  │ [Logo]   │  │  ┌─────────────────────────────┐    │  │
│  │ [+ New]  │  │  │  Project cards grid         │    │  │
│  │          │  │  │  (max-w-4xl, centered)      │    │  │
│  │ Recent   │  │  │                             │    │  │
│  │ projects │  │  └─────────────────────────────┘    │  │
│  │ list     │  │                                     │  │
│  │ ──────── │  │                                     │  │
│  │ [User]   │  │                                     │  │
│  └──────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Builder — Default (Chat Only)
```
┌─────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌─────────────────────────────────────┐  │
│  │ SIDEBAR  │  │          CHAT (centered)            │  │
│  │          │  │     ┌───────────────────┐           │  │
│  │ [Logo]   │  │     │  Message thread   │           │  │
│  │ [+ New]  │  │     │  (max-w-3xl)      │           │  │
│  │ Projects │  │     │                   │           │  │
│  │ list     │  │     └───────────────────┘           │  │
│  │          │  │     ┌───────────────────┐           │  │
│  │ ──────── │  │     │  [Input bar]      │           │  │
│  │ [User]   │  │     └───────────────────┘           │  │
│  └──────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Builder — With Preview (Artifacts-Style)
```
┌─────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ SIDEBAR  │  │  CHAT        │  │  PREVIEW PANEL    │  │
│  │          │  │  (compressed)│  │  (slides in)      │  │
│  │          │  │  Messages    │  │  [Preview|Code]   │  │
│  │          │  │  thread      │  │  tabs             │  │
│  │          │  │              │  │  ┌─────────────┐  │  │
│  │          │  │              │  │  │  iframe /    │  │  │
│  │          │  │              │  │  │  code view   │  │  │
│  │          │  │  [Input]     │  │  └─────────────┘  │  │
│  └──────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Affected Components

| Component | Change |
|-----------|--------|
| `src/index.css` | New warm palette tokens, radius scale, typography |
| `src/components/app-sidebar.tsx` | Open by default, project list, "New Project" CTA |
| `src/components/project-layout.tsx` | Major restructure — centered chat + slide-out preview |
| `src/components/builder-chat.tsx` | Centered column, new message styling |
| `src/components/builder-preview.tsx` | Becomes slide-out panel with tabs |
| `src/components/prompt-bar.tsx` | Rounded input, model selector chip, bottom-fixed |
| `src/components/ai-elements/message.tsx` | User bubble vs assistant no-bubble styling |
| `src/routes/_authenticated/dashboard.tsx` | Centered content, new card styling |
| Multiple `ai-elements/*` | Warm palette adaptation |
| `src/components/ui/button.tsx` | Pill-shaped primary variant |

---

## Next Steps
1. Enable Figma MCP plugin and generate visual mockups
2. Get final approval on mockups
3. Create implementation plan (invoke writing-plans skill)
4. Execute implementation
