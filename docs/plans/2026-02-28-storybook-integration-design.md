# Storybook 10 Integration Design

**Date**: 2026-02-28
**Status**: Approved

## Goal

Install Storybook 10 with full feature set to standardise UI component documentation across all 104 components (34 ui/ primitives, 60 ai-elements, ~10 page-level) before further UI work.

## Decisions

| Decision | Choice |
|----------|--------|
| Storybook version | 10.1.x (latest stable) |
| Builder | `@storybook/react-vite` (Vite 8 native) |
| Scope | All 104 components |
| Theme testing | Toolbar toggle (light/dark), not auto side-by-side |
| Visual regression | Chromatic from day 1 with TurboSnap |
| Mock data | Colocated `.fixtures.ts` files |
| Story format | CSF Factories (SB10 native), fallback to CSF3 |

## Directory Structure

```
.storybook/
  main.ts              # Framework config, addons, staticDirs
  preview.ts           # Global decorators (ThemeProvider, Tailwind, router)
  preview-head.html    # Font imports (DM Sans, DM Serif Display, JetBrains Mono)
  manager.ts           # Manager theme (branding)
  theme.ts             # Custom Storybook theme (VibeStack brand)

src/components/
  ui/
    button.tsx
    button.stories.tsx         # Colocated story
  ai-elements/
    diff-viewer.tsx
    diff-viewer.stories.tsx    # Colocated story
    diff-viewer.fixtures.ts   # Mock data for complex components
```

Stories colocated next to components. Fixtures colocated for components needing mock data.

## Addon Stack

| Addon | Purpose |
|-------|---------|
| `@storybook/addon-essentials` | Controls, Actions, Viewport, Backgrounds, Measure, Outline |
| `@storybook/addon-a11y` | Accessibility auditing (axe-core) per story |
| `@storybook/addon-interactions` | Play function testing UI |
| `@storybook/addon-links` | Cross-story navigation |
| `@storybook/addon-themes` | Toolbar theme switcher (light/dark) |
| `@storybook/addon-storysource` | View story source code |
| `@storybook/addon-designs` | Embed Figma frames next to stories |
| `@storybook/test` | `fn()`, `expect()`, `within()` for interaction tests |
| `chromatic` | Visual regression testing CI |

## Story Format — CSF Factories

```tsx
import { config } from '#.storybook/preview'
import { Button } from './button'

const { meta, story } = config.of({ component: Button })

export default meta({
  title: 'UI/Button',
  tags: ['autodocs'],
})

export const Default = story({})
export const Destructive = story({ args: { variant: 'destructive', children: 'Delete' } })
```

Fallback to CSF3 (`satisfies Meta<typeof Component>`) if CSF Factories aren't stable for the setup.

## Component Organization (Tags + Hierarchy)

| Category | Path | Tags | Count |
|----------|------|------|-------|
| UI Primitives | `UI/Button`, `UI/Card`, ... | `ui`, `autodocs` | 34 |
| AI Elements | `AI/DiffViewer`, `AI/ToolActivity`, ... | `ai`, `autodocs` | 60 |
| Builder | `Builder/ChatColumn`, `Builder/RightPanel`, ... | `builder`, `autodocs` | ~10 |

## Documentation

- **Autodocs** enabled on all stories via `tags: ['autodocs']`
- **MDX pages**:
  - `docs/Introduction.mdx` — project overview, design tokens
  - `docs/ThemeTokens.mdx` — visual token reference (oklch colors, spacing, radii)
  - `docs/AIElements.mdx` — guide to the AI element system
- **Doc blocks**: `<Canvas>`, `<ArgTypes>`, `<Description>`, `<Stories>` in MDX

## Interaction Testing (Play Functions)

Stories test user behavior directly:

```tsx
export const WithInteraction = story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await expect(canvas.getByText('Clicked')).toBeVisible()
  },
})
```

Applied to: collapsibles (tool-activity), theme toggles, sidebar navigation, form inputs, dialog open/close.

## Portable Stories → Vitest

Reuse stories as Vitest tests (no duplication):

```tsx
import { composeStories } from '@storybook/react'
import * as stories from './button.stories'

const { Default, Destructive } = composeStories(stories)

test('renders default button', () => {
  render(<Default />)
  expect(screen.getByRole('button')).toBeInTheDocument()
})
```

## Chromatic — Visual Regression CI

- `chromatic` npm package
- GitHub Action on every PR: `npx chromatic`
- TurboSnap enabled (only snapshots changed stories)
- Theme modes: captures both light and dark
- Viewport snapshots: Mobile (375px) + Desktop (1280px)

## Scripts

```json
{
  "storybook": "storybook dev -p 6006",
  "storybook:build": "storybook build -o dist/storybook",
  "chromatic": "chromatic --exit-zero-on-changes"
}
```

## Global Decorators (preview.ts)

Every story wrapped in:
1. **ThemeProvider** — light/dark/system (synced with toolbar addon)
2. **Tailwind CSS** — imports `index.css` for all tokens
3. **TanStack Router context** — `createMemoryHistory` for components using `useNavigate()`
4. **QueryClient** — TanStack Query provider for components using queries

## Constraints

- ESM-only config (Storybook 10 requirement)
- Node 20.16+ required
- Stories must not import server code (`@server/*`)
- Page-level components needing API calls will use fixture data (no MSW for now)
