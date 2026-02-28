# Storybook 10 Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install Storybook 10 with full addon stack and write colocated stories for all 104 components across `ui/`, `ai-elements/`, and page-level directories.

**Architecture:** Storybook 10.1.x with `@storybook/react-vite` builder (ESM-only). CSF3 story format (CSF Factories is preview-only in SB10). Global decorators wrap stories in ThemeProvider + Tailwind CSS + TanStack Router + QueryClient. Chromatic for visual regression on every PR.

**Tech Stack:** Storybook 10, React 19, Vite 8, Tailwind v4, Bun, Chromatic, @storybook/test, @storybook/addon-vitest

**Design doc:** `docs/plans/2026-02-28-storybook-integration-design.md`

---

## Task 1: Install Storybook 10 + All Addons

**Files:**
- Modify: `package.json`
- Create: `.storybook/main.ts`
- Create: `.storybook/preview.ts`

**Step 1: Initialize Storybook**

```bash
bunx storybook@latest init --type react --builder vite --skip-install
```

This generates `.storybook/main.ts` and `.storybook/preview.ts` with default content.

**Step 2: Install all addon packages**

```bash
bun add -D storybook @storybook/react-vite @storybook/addon-essentials @storybook/addon-a11y @storybook/addon-themes @storybook/addon-designs @storybook/test @storybook/addon-vitest chromatic
```

> **Note:** Do NOT install `@storybook/addon-interactions` or `@storybook/addon-links` — they are empty packages in SB10 (functionality merged into core).

**Step 3: Remove any auto-generated example stories**

```bash
rm -rf src/stories/
```

**Step 4: Add scripts to package.json**

Add these scripts (do not remove existing ones):

```json
{
  "storybook": "storybook dev -p 6006",
  "storybook:build": "storybook build -o dist/storybook",
  "chromatic": "chromatic --exit-zero-on-changes"
}
```

**Step 5: Install deps and verify**

```bash
bun install
```

**Step 6: Commit**

```bash
git add package.json bun.lock .storybook/ && git commit -m "chore: install Storybook 10 with full addon stack"
```

---

## Task 2: Configure `.storybook/main.ts`

**Files:**
- Modify: `.storybook/main.ts`

**Step 1: Write the main config**

Replace `.storybook/main.ts` with:

```typescript
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',

  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(ts|tsx)',
  ],

  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    '@storybook/addon-designs',
  ],

  staticDirs: ['../public'],

  docs: {
    autodocs: 'tag',
  },

  viteFinal: async (config) => {
    // Reuse the project's path aliases
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': new URL('../src', import.meta.url).pathname,
    }
    return config
  },
}

export default config
```

> **Key:** `import.meta.url` instead of `__dirname` (ESM-only requirement). The `viteFinal` hook ensures `@/` alias works in stories.

**Step 2: Verify Storybook starts**

```bash
bun run storybook
```

Expected: Storybook dev server starts on port 6006, no stories found yet (that's fine).

**Step 3: Commit**

```bash
git add .storybook/main.ts && git commit -m "chore: configure Storybook main.ts with addons and aliases"
```

---

## Task 3: Configure `.storybook/preview.ts` (Global Decorators)

**Files:**
- Modify: `.storybook/preview.ts`
- Create: `.storybook/preview-head.html`

**Step 1: Write preview-head.html for fonts**

Create `.storybook/preview-head.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500;700&display=swap"
  rel="stylesheet"
/>
```

**Step 2: Write preview.ts with global decorators**

Replace `.storybook/preview.ts` with:

```typescript
import '../src/index.css'

import type { Preview, ReactRenderer } from '@storybook/react'
import { withThemeByClassName } from '@storybook/addon-themes'

const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /date$/i,
      },
    },
    a11y: {
      // Enable a11y checks on all stories by default
      config: {},
      options: {},
    },
  },
  decorators: [
    withThemeByClassName<ReactRenderer>({
      themes: {
        light: 'light',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
  ],
  tags: ['autodocs'],
}

export default preview
```

> **Why `withThemeByClassName` instead of `withThemeFromJSXProvider`:** The project's `ThemeProvider` works by adding `light`/`dark` class to `<html>`. Storybook's `withThemeByClassName` does exactly this — adds the class to the story root. This is simpler and avoids wrapping in a custom provider that uses `localStorage` (which would conflict with the toolbar toggle).

**Step 3: Verify theme toggle works**

```bash
bun run storybook
```

Expected: Storybook opens with a theme toggle in the toolbar. Switching between light/dark changes component appearance.

**Step 4: Commit**

```bash
git add .storybook/preview.ts .storybook/preview-head.html && git commit -m "chore: configure global decorators with theme toggle and Tailwind CSS"
```

---

## Task 4: Custom Storybook Theme (Branding)

**Files:**
- Create: `.storybook/theme.ts`
- Create: `.storybook/manager.ts`

**Step 1: Create the theme**

Create `.storybook/theme.ts`:

```typescript
import { create } from 'storybook/theming'

export default create({
  base: 'dark',
  brandTitle: 'VibeStack UI',
  brandUrl: 'https://vibestack.dev',
  fontBase: '"DM Sans", sans-serif',
  fontCode: '"JetBrains Mono", monospace',
})
```

**Step 2: Apply the theme in manager**

Create `.storybook/manager.ts`:

```typescript
import { addons } from 'storybook/manager-api'
import theme from './theme'

addons.setConfig({ theme })
```

**Step 3: Commit**

```bash
git add .storybook/theme.ts .storybook/manager.ts && git commit -m "chore: add VibeStack branding to Storybook manager"
```

---

## Task 5: UI Primitives Stories — Form Controls (11 components)

**Files to create:**
- `src/components/ui/button.stories.tsx`
- `src/components/ui/input.stories.tsx`
- `src/components/ui/textarea.stories.tsx`
- `src/components/ui/checkbox.stories.tsx`
- `src/components/ui/switch.stories.tsx`
- `src/components/ui/radio-group.stories.tsx`
- `src/components/ui/select.stories.tsx`
- `src/components/ui/label.stories.tsx`
- `src/components/ui/form.stories.tsx`
- `src/components/ui/input-group.stories.tsx`
- `src/components/ui/slider.stories.tsx` (if exists)

**Pattern — every ui/ story follows this template:**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { Component } from './component'

const meta = {
  title: 'UI/ComponentName',
  component: Component,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Component>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const VariantA: Story = { args: { variant: 'a' } }
```

**Step 1: Write button.stories.tsx (reference story)**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Mail } from 'lucide-react'
import { Button } from './button'

const meta = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { onClick: fn(), children: 'Button' },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete' },
}

export const Outline: Story = {
  args: { variant: 'outline', children: 'Cancel' },
}

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Secondary' },
}

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Ghost' },
}

export const Link: Story = {
  args: { variant: 'link', children: 'Link' },
}

export const Small: Story = {
  args: { size: 'sm', children: 'Small' },
}

export const Large: Story = {
  args: { size: 'lg', children: 'Large' },
}

export const ExtraSmall: Story = {
  args: { size: 'xs', children: 'XS' },
}

export const Icon: Story = {
  args: { size: 'icon', children: <Mail className="size-4" />, 'aria-label': 'Send email' },
}

export const WithIcon: Story = {
  args: { children: <><Mail className="size-4" /> Send Email</> },
}

export const Disabled: Story = {
  args: { disabled: true, children: 'Disabled' },
}

export const Loading: Story = {
  args: { disabled: true, children: 'Loading...' },
}
```

**Step 2: Write input.stories.tsx**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { Input } from './input'

const meta = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { placeholder: 'Enter text...' },
}

export const WithValue: Story = {
  args: { defaultValue: 'Hello world' },
}

export const Disabled: Story = {
  args: { disabled: true, placeholder: 'Disabled' },
}

export const WithType: Story = {
  args: { type: 'email', placeholder: 'email@example.com' },
}
```

**Step 3: Write the remaining 9 form control stories**

Follow the same pattern for each component. Key args per component:

| Component | Key args to showcase |
|-----------|---------------------|
| `textarea` | `placeholder`, `rows`, `disabled` |
| `checkbox` | `checked`, `disabled`, `onCheckedChange: fn()` |
| `switch` | `checked`, `size: 'sm' \| 'default'`, `disabled` |
| `radio-group` | Wrap `RadioGroup` + `RadioGroupItem` children |
| `select` | Wrap `Select` + `SelectTrigger` + `SelectContent` + `SelectItem` children |
| `label` | `children: 'Email'`, `htmlFor: 'email'` |
| `form` | Compose with react-hook-form — show FormField + FormItem + FormLabel + FormControl + FormMessage |
| `input-group` | Compose InputGroup + InputGroupAddon + InputGroupInput |

**Step 4: Verify all form control stories render**

```bash
bun run storybook
```

Navigate to UI/ section. All 11 components should show with autodocs.

**Step 5: Commit**

```bash
git add src/components/ui/*.stories.tsx && git commit -m "feat(storybook): add stories for UI form control components"
```

---

## Task 6: UI Primitives Stories — Layout & Feedback (12 components)

**Files to create:**
- `src/components/ui/card.stories.tsx`
- `src/components/ui/dialog.stories.tsx`
- `src/components/ui/sheet.stories.tsx`
- `src/components/ui/accordion.stories.tsx`
- `src/components/ui/tabs.stories.tsx`
- `src/components/ui/collapsible.stories.tsx`
- `src/components/ui/alert.stories.tsx`
- `src/components/ui/badge.stories.tsx`
- `src/components/ui/progress.stories.tsx`
- `src/components/ui/skeleton.stories.tsx`
- `src/components/ui/spinner.stories.tsx`
- `src/components/ui/separator.stories.tsx`

**Step 1: Write card.stories.tsx (compound component pattern)**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card'
import { Button } from './button'

const meta = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content body text.</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  ),
}
```

**Step 2: Write dialog.stories.tsx (interactive play function)**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from '@storybook/test'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from './dialog'
import { Button } from './button'

const meta = {
  title: 'UI/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /open dialog/i }))
    await expect(document.querySelector('[role="dialog"]')).toBeInTheDocument()
  },
}
```

**Step 3: Write the remaining 10 stories**

Follow compound component pattern for: `sheet`, `accordion`, `tabs`, `collapsible`.
Follow simple pattern for: `alert`, `badge`, `progress`, `skeleton`, `spinner`, `separator`.

Key args per component:

| Component | Key variants/stories |
|-----------|---------------------|
| `sheet` | `side: 'left' \| 'right' \| 'top' \| 'bottom'` |
| `accordion` | Multiple `AccordionItem` children, `type: 'single' \| 'multiple'` |
| `tabs` | `TabsList` + multiple `TabsTrigger` + `TabsContent` |
| `collapsible` | Open/closed states |
| `alert` | `variant: 'default' \| 'destructive'` |
| `badge` | `variant: 'default' \| 'secondary' \| 'destructive' \| 'outline'` |
| `progress` | `value: 0, 25, 50, 75, 100` |
| `skeleton` | Various sizes |
| `spinner` | Default |
| `separator` | `orientation: 'horizontal' \| 'vertical'` |

**Step 4: Verify and commit**

```bash
bun run storybook
git add src/components/ui/*.stories.tsx && git commit -m "feat(storybook): add stories for UI layout and feedback components"
```

---

## Task 7: UI Primitives Stories — Overlays & Navigation (11 components)

**Files to create:**
- `src/components/ui/dropdown-menu.stories.tsx`
- `src/components/ui/popover.stories.tsx`
- `src/components/ui/tooltip.stories.tsx`
- `src/components/ui/hover-card.stories.tsx`
- `src/components/ui/command.stories.tsx`
- `src/components/ui/scroll-area.stories.tsx`
- `src/components/ui/avatar.stories.tsx`
- `src/components/ui/carousel.stories.tsx`
- `src/components/ui/table.stories.tsx`
- `src/components/ui/sonner.stories.tsx`
- `src/components/ui/sidebar.stories.tsx`
- `src/components/ui/button-group.stories.tsx`

**Step 1: Write dropdown-menu.stories.tsx (nested compound component)**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from './dropdown-menu'
import { Button } from './button'

const meta = {
  title: 'UI/DropdownMenu',
  component: DropdownMenu,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DropdownMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open Menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuItem variant="destructive">Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const WithSubMenu: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Options</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>New File</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Share</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Email</DropdownMenuItem>
            <DropdownMenuItem>Slack</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}
```

**Step 2: Write table.stories.tsx (with fixture data)**

Create `src/components/ui/table.fixtures.ts`:

```typescript
export const invoices = [
  { id: 'INV001', status: 'Paid', method: 'Credit Card', amount: '$250.00' },
  { id: 'INV002', status: 'Pending', method: 'PayPal', amount: '$150.00' },
  { id: 'INV003', status: 'Unpaid', method: 'Bank Transfer', amount: '$350.00' },
  { id: 'INV004', status: 'Paid', method: 'Credit Card', amount: '$450.00' },
  { id: 'INV005', status: 'Paid', method: 'PayPal', amount: '$550.00' },
]
```

```typescript
// table.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import {
  Table, TableBody, TableCaption, TableCell,
  TableHead, TableHeader, TableRow, TableFooter,
} from './table'
import { invoices } from './table.fixtures'

const meta = {
  title: 'UI/Table',
  component: Table,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Table>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Recent invoices</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell className="font-medium">{inv.id}</TableCell>
            <TableCell>{inv.status}</TableCell>
            <TableCell>{inv.method}</TableCell>
            <TableCell className="text-right">{inv.amount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right">$1,750.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
}
```

**Step 3: Write sidebar.stories.tsx (needs SidebarProvider)**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import {
  Sidebar, SidebarProvider, SidebarHeader, SidebarContent,
  SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
} from './sidebar'
import { Home, Settings, User } from 'lucide-react'

const meta = {
  title: 'UI/Sidebar',
  component: Sidebar,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <SidebarProvider>
        <Story />
        <main className="flex-1 p-4">Main content area</main>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof Sidebar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Sidebar>
      <SidebarHeader>
        <span className="font-semibold text-lg px-2">VibeStack</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton><Home className="size-4" /> Home</SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton><User className="size-4" /> Profile</SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton><Settings className="size-4" /> Settings</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  ),
}
```

**Step 4: Write remaining stories (tooltip, popover, hover-card, command, avatar, carousel, scroll-area, sonner, button-group)**

Follow compound component pattern. Key notes:

| Component | Special handling |
|-----------|-----------------|
| `tooltip` | Needs `TooltipProvider` decorator |
| `command` | Compose `CommandInput` + `CommandList` + `CommandGroup` + `CommandItem` |
| `avatar` | Show `AvatarImage` + `AvatarFallback`, `size` variants |
| `carousel` | Compose `CarouselContent` + `CarouselItem` children |
| `sonner` | Import `toast` from `sonner`, button triggers `toast('Hello')` |
| `scroll-area` | Long content inside fixed-height container |
| `button-group` | Compose `ButtonGroup` + `Button` children |

**Step 5: Verify and commit**

```bash
bun run storybook
git add src/components/ui/*.stories.tsx src/components/ui/*.fixtures.ts && git commit -m "feat(storybook): add stories for UI overlay and navigation components"
```

---

## Task 8: AI Elements Stories — Core Display (15 components)

**Files to create (each gets `.stories.tsx`, some get `.fixtures.ts`):**
- `thinking-card.stories.tsx`
- `code-block.stories.tsx` + `code-block.fixtures.ts`
- `diff-viewer.stories.tsx` + `diff-viewer.fixtures.ts`
- `message.stories.tsx`
- `agent.stories.tsx` + `agent.fixtures.ts`
- `file-tree.stories.tsx` + `file-tree.fixtures.ts`
- `plan.stories.tsx`
- `artifact.stories.tsx`
- `shimmer.stories.tsx`
- `conversation.stories.tsx` + `conversation.fixtures.ts`
- `stack-trace.stories.tsx` + `stack-trace.fixtures.ts`
- `model-selector.stories.tsx`
- `action-card.stories.tsx`
- `operation-summary-card.stories.tsx`
- `plan-approval-card.stories.tsx`

All in `src/components/ai-elements/`.

**Step 1: Write thinking-card.stories.tsx (simple props, timer)**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { ThinkingCard } from './thinking-card'

const meta = {
  title: 'AI/ThinkingCard',
  component: ThinkingCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ThinkingCard>

export default meta
type Story = StoryObj<typeof meta>

export const Thinking: Story = {
  args: {
    startedAt: Date.now() - 5000,
    status: 'thinking',
  },
}

export const Complete: Story = {
  args: {
    startedAt: Date.now() - 12000,
    status: 'complete',
    durationMs: 12000,
  },
}

export const WithContent: Story = {
  args: {
    startedAt: Date.now() - 8000,
    status: 'complete',
    durationMs: 8000,
    children: 'I need to analyze the component structure and determine the best approach for implementing the sidebar navigation.',
  },
}
```

**Step 2: Write diff-viewer.stories.tsx + fixtures**

Create `src/components/ai-elements/diff-viewer.fixtures.ts`:

```typescript
export const oldContent = `import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  )
}`

export const newContent = `import { useState, useCallback } from 'react'

export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = useState(initial)
  const increment = useCallback(() => setCount((c) => c + 1), [])
  return (
    <button onClick={increment}>
      Count: {count}
    </button>
  )
}`

export const newFileContent = `export function Header() {
  return (
    <header className="flex items-center justify-between p-4">
      <h1 className="text-xl font-bold">My App</h1>
      <nav>
        <a href="/about">About</a>
      </nav>
    </header>
  )
}`
```

```typescript
// diff-viewer.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { DiffViewer } from './diff-viewer'
import { oldContent, newContent, newFileContent } from './diff-viewer.fixtures'

const meta = {
  title: 'AI/DiffViewer',
  component: DiffViewer,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof DiffViewer>

export default meta
type Story = StoryObj<typeof meta>

export const FileEdit: Story = {
  args: {
    filename: 'src/components/Counter.tsx',
    oldContent,
    newContent,
  },
}

export const NewFile: Story = {
  args: {
    filename: 'src/components/Header.tsx',
    newContent: newFileContent,
  },
}
```

**Step 3: Write code-block.stories.tsx + fixtures**

Create `code-block.fixtures.ts` with sample code in TypeScript, Python, JSON. Story shows each language + copy button interaction.

**Step 4: Write file-tree.stories.tsx + fixtures**

Create `file-tree.fixtures.ts` with a nested file structure (src/, components/, routes/). Story shows expanded/collapsed states.

**Step 5: Write remaining 10 stories**

Follow the same pattern. Components needing fixtures:

| Component | Fixture data |
|-----------|-------------|
| `agent` | Tool definitions, schema JSON strings |
| `conversation` | Array of user/assistant messages |
| `stack-trace` | Error frame objects |

Components with simple props (no fixtures needed): `message`, `plan`, `artifact`, `shimmer`, `model-selector`, `action-card`, `operation-summary-card`, `plan-approval-card`.

**Step 6: Verify and commit**

```bash
bun run storybook
git add src/components/ai-elements/*.stories.tsx src/components/ai-elements/*.fixtures.ts && git commit -m "feat(storybook): add stories for core AI display components"
```

---

## Task 9: AI Elements Stories — Interactive & Media (15 components)

**Files to create in `src/components/ai-elements/`:**
- `tool-activity.stories.tsx` + `tool-activity.fixtures.ts`
- `prompt-input.stories.tsx`
- `sandbox.stories.tsx`
- `web-preview.stories.tsx`
- `jsx-preview.stories.tsx`
- `terminal.stories.tsx`
- `image.stories.tsx`
- `inline-citation.stories.tsx` + `inline-citation.fixtures.ts`
- `sources.stories.tsx`
- `confirmation.stories.tsx`
- `suggestion.stories.tsx`
- `controls.stories.tsx`
- `toolbar.stories.tsx`
- `property-panel.stories.tsx`
- `schema-display.stories.tsx`

**Step 1: Write tool-activity.stories.tsx + fixtures**

Create `tool-activity.fixtures.ts`:

```typescript
import type { ToolStep } from '@/hooks/use-agent-stream'

export const sampleToolSteps: ToolStep[] = [
  {
    id: '1',
    tool: 'writeFile',
    args: { path: 'src/App.tsx' },
    status: 'complete',
    result: 'File written successfully',
  },
  {
    id: '2',
    tool: 'runBuild',
    args: {},
    status: 'complete',
    result: 'Build succeeded',
  },
  {
    id: '3',
    tool: 'installPackage',
    args: { name: 'framer-motion' },
    status: 'running',
  },
]
```

> **Important:** Check the actual `ToolStep` type in `src/hooks/use-agent-stream.ts` and match the fixture to it exactly. The fields above are approximate — read the real type.

**Step 2: Write the remaining 14 stories**

Follow same patterns. Key notes:

| Component | Special handling |
|-----------|-----------------|
| `prompt-input` | Needs `PromptInputProvider` wrapper. Show with/without attachments. |
| `web-preview` | Use `about:blank` as URL. Show with mock console logs. |
| `terminal` | Show with ANSI color output (use ansi-to-react). |
| `image` | Create a small base64 placeholder image in fixtures. |
| `confirmation` | Show with accept/reject buttons + `fn()` actions. |
| `suggestion` | Array of suggestion strings. |

**Step 3: Verify and commit**

```bash
bun run storybook
git add src/components/ai-elements/*.stories.tsx src/components/ai-elements/*.fixtures.ts && git commit -m "feat(storybook): add stories for interactive AI elements"
```

---

## Task 10: AI Elements Stories — Cards & Remaining (30 components)

**Files to create in `src/components/ai-elements/`:**

Batch 1 — Timeline cards:
- `architecture-card.stories.tsx`
- `page-progress-card.stories.tsx`
- `file-assembly-card.stories.tsx`
- `theme-tokens-card.stories.tsx`
- `test-results.stories.tsx`
- `package-info.stories.tsx`

Batch 2 — Communication:
- `message-response.stories.tsx`
- `attachments.stories.tsx`
- `context.stories.tsx`
- `chain-of-thought.stories.tsx`
- `reasoning.stories.tsx`
- `transcription.stories.tsx`
- `open-in-chat.stories.tsx`
- `snippet.stories.tsx`

Batch 3 — Layout & structure:
- `panel.stories.tsx`
- `canvas.stories.tsx`
- `node.stories.tsx`
- `edge.stories.tsx`
- `connection.stories.tsx`
- `checkpoint.stories.tsx`
- `task.stories.tsx`
- `queue.stories.tsx`
- `environment-variables.stories.tsx`
- `commit.stories.tsx`
- `tool.stories.tsx`

Batch 4 — Audio & voice:
- `audio-player.stories.tsx`
- `voice-selector.stories.tsx`
- `mic-selector.stories.tsx`
- `speech-input.stories.tsx`
- `persona.stories.tsx`

**Step 1: Read each component to understand its props**

Before writing any story, read the component file to understand its exact props interface. Many of these components may be compound (multiple exports) or context-dependent.

**Step 2: Write stories for each batch**

Follow the established CSF3 pattern. For each component:
- If props are simple primitives → args-based story
- If compound component → render function story
- If needs mock data → create colocated `.fixtures.ts`
- If has interactive behavior → add play function

**Step 3: Verify and commit (one commit per batch)**

```bash
# After each batch:
bun run storybook
git add src/components/ai-elements/*.stories.tsx src/components/ai-elements/*.fixtures.ts
git commit -m "feat(storybook): add stories for [batch description]"
```

---

## Task 11: Page-Level Component Stories (10 components)

**Files to create:**
- `src/components/app-sidebar.stories.tsx` + `app-sidebar.fixtures.ts`
- `src/components/builder-page.stories.tsx`
- `src/components/chat-column.stories.tsx` + `chat-column.fixtures.ts`
- `src/components/right-panel.stories.tsx`
- `src/components/prompt-bar.stories.tsx`
- `src/components/hero-prompt.stories.tsx`
- `src/components/landing-navbar.stories.tsx`
- `src/components/landing-prompt-bar.stories.tsx`
- `src/components/credit-display.stories.tsx`
- `src/components/perspective-grid.stories.tsx`
- `src/components/artifact-card.stories.tsx`
- `src/components/clarification-questions.stories.tsx`

**These components need heavier mocking because they use:**
- `useAuth()` — mock with a decorator
- `useQuery()` / TanStack Query — mock with `QueryClientProvider`
- TanStack Router `Link`, `useNavigate()` — mock with `createMemoryHistory`
- `useSidebar()` — wrap in `SidebarProvider`

**Step 1: Create shared decorators file**

Create `src/components/storybook-decorators.tsx`:

```typescript
import type { Decorator } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SidebarProvider } from './ui/sidebar'

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

export const withFullscreen: Decorator = (Story) => (
  <div className="h-screen w-screen">
    <Story />
  </div>
)
```

**Step 2: Write credit-display.stories.tsx (simplest page component)**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { CreditDisplay } from './credit-display'

const meta = {
  title: 'Builder/CreditDisplay',
  component: CreditDisplay,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CreditDisplay>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { remaining: 8500, monthly: 10000, plan: 'pro' },
}

export const LowCredits: Story = {
  args: { remaining: 1200, monthly: 10000, plan: 'pro' },
}

export const FreePlan: Story = {
  args: { remaining: 500, monthly: 1000, plan: 'free' },
}

export const Empty: Story = {
  args: { remaining: 0, monthly: 1000, plan: 'free' },
}
```

**Step 3: Write remaining page-level stories**

For components that use `useAuth()`, create a mock decorator:

```typescript
// In the story file or storybook-decorators.tsx
import type { Decorator } from '@storybook/react'

export const withMockAuth: Decorator = (Story) => {
  // Mock useAuth by providing the context value the component expects
  // This depends on how useAuth() is implemented — may need jest.mock or module mock
  return <Story />
}
```

> **Note:** Components deeply coupled to auth/router may need `sb.mock` (Storybook 10's new mocking API) or may need to be refactored to accept props instead of reading context directly. Document which components can't be fully rendered in Storybook.

**Step 4: Verify and commit**

```bash
bun run storybook
git add src/components/*.stories.tsx src/components/*.fixtures.ts src/components/storybook-decorators.tsx && git commit -m "feat(storybook): add stories for page-level builder components"
```

---

## Task 12: MDX Documentation Pages

**Files to create:**
- `src/docs/Introduction.mdx`
- `src/docs/ThemeTokens.mdx`
- `src/docs/AIElements.mdx`

**Step 1: Write Introduction.mdx**

```mdx
import { Meta } from '@storybook/blocks'

<Meta title="Docs/Introduction" />

# VibeStack UI

AI-powered app builder — component library for the builder interface.

## Component Categories

- **UI Primitives** — 34 shadcn/ui components (Button, Card, Dialog, etc.)
- **AI Elements** — 60 specialized components for AI agent interactions
- **Builder** — 10 page-level components for the builder UI

## Design Tokens

The design system uses Tailwind v4 with oklch colors. See [Theme Tokens](?path=/docs/docs-themetokens--docs) for the full token reference.

## Getting Started

```bash
bun run storybook  # Start Storybook dev server
```
```

**Step 2: Write ThemeTokens.mdx**

Show all CSS custom properties from `src/index.css` — colors, spacing, radii, fonts.

**Step 3: Write AIElements.mdx**

Document the AI element system: how timeline cards work, how tool activity renders, message flow.

**Step 4: Verify and commit**

```bash
bun run storybook
git add src/docs/*.mdx && git commit -m "docs(storybook): add MDX documentation pages"
```

---

## Task 13: Chromatic CI Setup

**Files to create:**
- `.github/workflows/chromatic.yml`

**Step 1: Write the GitHub Action**

```yaml
name: Chromatic

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  chromatic:
    name: Visual Regression
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: bun install --frozen-lockfile

      - uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          buildScriptName: storybook:build
          exitZeroOnChanges: true
          autoAcceptChanges: main
          onlyChanged: true
```

> **`onlyChanged: true`** enables TurboSnap — only snapshots stories affected by code changes.
> **`autoAcceptChanges: main`** auto-accepts on main branch (baseline).
> **`exitZeroOnChanges: true`** prevents CI from failing on visual changes (they need human review).

**Step 2: Note for user**

The user needs to:
1. Sign up at [chromatic.com](https://www.chromatic.com) and create a project
2. Get the project token
3. Add `CHROMATIC_PROJECT_TOKEN` as a GitHub repository secret

**Step 3: Commit**

```bash
git add .github/workflows/chromatic.yml && git commit -m "ci: add Chromatic visual regression workflow"
```

---

## Task 14: Portable Stories + Vitest Integration

**Files to create/modify:**
- Modify: `vitest.config.ts`
- Create: `.storybook/vitest.setup.ts`

**Step 1: Create Storybook Vitest setup file**

Create `.storybook/vitest.setup.ts`:

```typescript
import { setProjectAnnotations } from '@storybook/react'
import * as previewAnnotations from './preview'

setProjectAnnotations([previewAnnotations])
```

**Step 2: Update vitest.config.ts**

Read the existing `vitest.config.ts` first. Add `storybookTest` plugin and the setup file:

```typescript
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'

// Add to plugins array:
storybookTest({ storybookScript: 'bun run storybook --ci' })

// Add to test.setupFiles array:
'./.storybook/vitest.setup.ts'
```

> **Important:** Don't overwrite existing vitest config — merge the Storybook additions into what's already there.

**Step 3: Verify stories run as tests**

```bash
bun run test
```

Expected: Stories with play functions appear as test cases. Stories without play functions render without error.

**Step 4: Commit**

```bash
git add vitest.config.ts .storybook/vitest.setup.ts && git commit -m "feat: integrate Storybook portable stories with Vitest"
```

---

## Task 15: Update .gitignore and CLAUDE.md

**Files to modify:**
- `.gitignore`
- `CLAUDE.md`

**Step 1: Add Storybook build output to .gitignore**

Add:
```
dist/storybook/
storybook-static/
```

**Step 2: Update CLAUDE.md**

Add to the Commands section:
```
bun run storybook       # Storybook dev server (port 6006)
bun run storybook:build # Build static Storybook
bun run chromatic       # Run Chromatic visual regression
```

Add to Architecture > Directory Structure:
```
.storybook/              # Storybook 10 config (ESM-only)
  main.ts                # Framework, addons, story globs
  preview.ts             # Global decorators (theme, Tailwind)
  preview-head.html      # Font imports
  manager.ts             # Manager theme (branding)
  theme.ts               # Custom Storybook theme
```

Add a brief note about story conventions:
```
## Storybook

- Stories colocated next to components: `component.stories.tsx`
- Mock data in colocated fixtures: `component.fixtures.ts`
- Story format: CSF3 with `satisfies Meta<typeof Component>`
- All stories tagged `autodocs` for auto-generated prop tables
- Chromatic runs on every PR for visual regression
```

**Step 3: Commit**

```bash
git add .gitignore CLAUDE.md && git commit -m "docs: update CLAUDE.md with Storybook conventions"
```

---

## Task 16: Final Verification

**Step 1: Run Storybook and verify all stories render**

```bash
bun run storybook
```

Expected: All 104 component stories render without errors. Autodocs pages generate prop tables. Theme toggle works. MDX pages render.

**Step 2: Build Storybook**

```bash
bun run storybook:build
```

Expected: Static build succeeds in `dist/storybook/`.

**Step 3: Run full test suite**

```bash
bun run lint && bunx tsc --noEmit && bun run test
```

Expected: No regressions. Lint clean, typecheck passes, tests pass.

**Step 4: Run Storybook tests via Vitest**

```bash
bun run test --run
```

Expected: Story-based tests appear and pass.

---

## Execution Summary

| Task | Description | Estimated Stories |
|------|-------------|-------------------|
| 1-4 | Setup & config | 0 (infrastructure) |
| 5 | UI form controls | 11 |
| 6 | UI layout & feedback | 12 |
| 7 | UI overlays & navigation | 12 |
| 8 | AI core display | 15 |
| 9 | AI interactive & media | 15 |
| 10 | AI cards & remaining | 30 |
| 11 | Page-level | 10 |
| 12 | MDX docs | 3 pages |
| 13 | Chromatic CI | 1 workflow |
| 14 | Vitest integration | config |
| 15 | Docs update | meta |
| 16 | Final verification | — |
| **Total** | | **~105 stories + 3 MDX + CI** |
