# Phase 1: Lovable-Inspired Chat UX Overhaul

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace VibeStack's per-agent accordion timeline with Lovable-style condensed action cards, a "Thought for Xs" thinking indicator, and an input area with mode badges.

**Architecture:** Pure frontend refactor — no server/pipeline changes. The existing `TimelineEntry[]` data model stays unchanged. We add a rendering layer that maps `agentId`-based entries to operation-type cards. New components go in `src/components/ai-elements/`. The main refactor is in `builder-chat.tsx` lines 1075-1314 (timeline rendering section).

**Tech Stack:** React 19, Tailwind v4, shadcn/ui (Collapsible, Tabs, Badge), Motion (framer-motion), lucide-react icons.

---

### Task 1: Create `ActionCard` — the generic condensed card shell

**Files:**
- Create: `src/components/ai-elements/action-card.tsx`
- Test: `tests/action-card.test.tsx`

**Step 1: Write the failing test**

```tsx
// tests/action-card.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import {
  ActionCard,
  ActionCardHeader,
  ActionCardSummary,
  ActionCardTabs,
  ActionCardContent,
} from '@/components/ai-elements/action-card'

describe('ActionCard', () => {
  it('renders collapsed with summary line', () => {
    render(
      <ActionCard>
        <ActionCardHeader icon="sparkles" label="Designed architecture" status="complete" durationMs={4200} />
        <ActionCardSummary>8 pages, kanban archetype</ActionCardSummary>
        <ActionCardTabs>
          <ActionCardContent tab="details">Detail content</ActionCardContent>
          <ActionCardContent tab="preview">Preview content</ActionCardContent>
        </ActionCardTabs>
      </ActionCard>,
    )
    expect(screen.getByText('Designed architecture')).toBeInTheDocument()
    expect(screen.getByText('8 pages, kanban archetype')).toBeInTheDocument()
    expect(screen.queryByText('Detail content')).not.toBeInTheDocument()
  })

  it('expands to show Details tab on click', () => {
    render(
      <ActionCard>
        <ActionCardHeader icon="sparkles" label="Designed architecture" status="complete" durationMs={4200} />
        <ActionCardTabs>
          <ActionCardContent tab="details">Detail content</ActionCardContent>
          <ActionCardContent tab="preview">Preview content</ActionCardContent>
        </ActionCardTabs>
      </ActionCard>,
    )
    fireEvent.click(screen.getByRole('button', { name: /designed architecture/i }))
    expect(screen.getByText('Detail content')).toBeInTheDocument()
  })

  it('shows spinner when status is running', () => {
    render(
      <ActionCard>
        <ActionCardHeader icon="sparkles" label="Generating pages" status="running" elapsedMs={3000} />
      </ActionCard>,
    )
    expect(screen.getByText('Generating pages')).toBeInTheDocument()
    expect(screen.getByText('3.0s')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/action-card.test.tsx`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```tsx
// src/components/ai-elements/action-card.tsx
import { type ReactNode, createContext, useContext, useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { CheckCircle2, ChevronDown, Loader2, type LucideIcon, Sparkles, Brain, Code2, Package, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

// --- Icon registry ---
const ICONS: Record<string, LucideIcon> = {
  brain: Brain,
  sparkles: Sparkles,
  code: Code2,
  package: Package,
  shield: ShieldCheck,
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

// --- Context for tab state ---
const ActionCardContext = createContext<{
  activeTab: string | null
  setActiveTab: (tab: string | null) => void
}>({ activeTab: null, setActiveTab: () => {} })

// --- ActionCard (root) ---
export function ActionCard({ children, className }: { children: ReactNode; className?: string }) {
  const [activeTab, setActiveTab] = useState<string | null>(null)
  return (
    <ActionCardContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn('w-full rounded-lg border bg-card', className)}>{children}</div>
    </ActionCardContext.Provider>
  )
}

// --- ActionCardHeader ---
export function ActionCardHeader({
  icon,
  label,
  status,
  durationMs,
  elapsedMs,
}: {
  icon: string
  label: string
  status: 'running' | 'complete'
  durationMs?: number
  elapsedMs?: number
}) {
  const Icon = ICONS[icon] ?? Sparkles
  const { activeTab, setActiveTab } = useContext(ActionCardContext)

  return (
    <button
      type="button"
      onClick={() => setActiveTab(activeTab ? null : 'details')}
      aria-label={label}
      className="flex w-full items-center gap-2 p-3 text-left"
    >
      {status === 'complete' ? (
        <CheckCircle2 className="size-4 shrink-0 text-green-500" />
      ) : (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      )}
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
      {status === 'complete' && durationMs != null && (
        <span className="text-xs text-muted-foreground">{formatDuration(durationMs)}</span>
      )}
      {status === 'running' && elapsedMs != null && (
        <span className="text-xs text-muted-foreground">{formatDuration(elapsedMs)}</span>
      )}
      <ChevronDown
        className={cn(
          'ml-auto size-4 text-muted-foreground transition-transform',
          activeTab && 'rotate-180',
        )}
      />
    </button>
  )
}

// --- ActionCardSummary (always visible below header) ---
export function ActionCardSummary({ children, className }: { children: ReactNode; className?: string }) {
  const { activeTab } = useContext(ActionCardContext)
  if (activeTab) return null // hide summary when expanded
  return <div className={cn('px-3 pb-3 text-sm text-muted-foreground', className)}>{children}</div>
}

// --- ActionCardTabs (Details / Preview toggle + content) ---
export function ActionCardTabs({ children }: { children: ReactNode }) {
  const { activeTab, setActiveTab } = useContext(ActionCardContext)
  if (!activeTab) return null

  // Extract tab names from children
  const tabs: string[] = []
  const contents = new Map<string, ReactNode>()

  const childArray = Array.isArray(children) ? children : [children]
  for (const child of childArray) {
    if (child && typeof child === 'object' && 'props' in child && child.props.tab) {
      tabs.push(child.props.tab)
      contents.set(child.props.tab, child.props.children)
    }
  }

  return (
    <div className="border-t">
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b px-3 py-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors',
                activeTab === tab
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      )}
      <div className="p-3">{contents.get(activeTab) ?? contents.get(tabs[0])}</div>
    </div>
  )
}

// --- ActionCardContent (tab content slot) ---
export function ActionCardContent({ tab, children }: { tab: string; children: ReactNode }) {
  // Rendered by ActionCardTabs — this is just a slot marker
  return null
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/action-card.test.tsx`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/components/ai-elements/action-card.tsx tests/action-card.test.tsx
git commit -m "feat: add ActionCard condensed card component"
```

---

### Task 2: Create `ThinkingCard` — the "Thought for Xs" indicator

**Files:**
- Create: `src/components/ai-elements/thinking-card.tsx`
- Test: `tests/thinking-card.test.tsx`

**Step 1: Write the failing test**

```tsx
// tests/thinking-card.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ThinkingCard } from '@/components/ai-elements/thinking-card'

describe('ThinkingCard', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('shows elapsed time while thinking', () => {
    render(<ThinkingCard startedAt={Date.now()} status="thinking" />)
    expect(screen.getByText(/thinking/i)).toBeInTheDocument()
  })

  it('shows final time and reasoning when complete', () => {
    render(
      <ThinkingCard startedAt={Date.now() - 12000} status="complete" durationMs={12000}>
        {"I'll build a clean todo app with warm tones."}
      </ThinkingCard>,
    )
    expect(screen.getByText('Thought for 12s')).toBeInTheDocument()
    expect(screen.getByText(/clean todo app/)).toBeInTheDocument()
  })

  it('renders structured features/design sections', () => {
    render(
      <ThinkingCard startedAt={Date.now() - 8000} status="complete" durationMs={8000}>
        {'**Features:** Add tasks, delete tasks\n**Design:** Warm stone palette'}
      </ThinkingCard>,
    )
    expect(screen.getByText(/Features:/)).toBeInTheDocument()
    expect(screen.getByText(/Design:/)).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/thinking-card.test.tsx`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```tsx
// src/components/ai-elements/thinking-card.tsx
import { type ReactNode, useEffect, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { MessageResponse } from '@/components/ai-elements/message'
import { Suspense } from 'react'

export function ThinkingCard({
  startedAt,
  status,
  durationMs,
  children,
}: {
  startedAt: number
  status: 'thinking' | 'complete'
  durationMs?: number
  children?: ReactNode
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (status !== 'thinking') return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt, status])

  const displayTime =
    status === 'complete' && durationMs != null
      ? `${Math.round(durationMs / 1000)}s`
      : `${elapsed}s`

  return (
    <div className="w-full rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm">
        <Lightbulb className="size-4 text-amber-500" />
        <span className="font-medium text-muted-foreground">
          {status === 'thinking' ? `Thinking... ${displayTime}` : `Thought for ${displayTime}`}
        </span>
      </div>
      {children && (
        <div className="mt-3 text-sm">
          <Suspense fallback={<div className="text-muted-foreground">{String(children)}</div>}>
            <MessageResponse>{String(children)}</MessageResponse>
          </Suspense>
        </div>
      )}
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/thinking-card.test.tsx`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/components/ai-elements/thinking-card.tsx tests/thinking-card.test.tsx
git commit -m "feat: add ThinkingCard component for analyst reasoning"
```

---

### Task 3: Create `OperationSummaryCard` — the "Assembled N files" grouped card

**Files:**
- Create: `src/components/ai-elements/operation-summary-card.tsx`
- Test: `tests/operation-summary-card.test.tsx`

**Step 1: Write the failing test**

```tsx
// tests/operation-summary-card.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { OperationSummaryCard } from '@/components/ai-elements/operation-summary-card'

describe('OperationSummaryCard', () => {
  const files = [
    { path: 'src/main.tsx', category: 'wiring' as const },
    { path: 'src/index.css', category: 'style' as const },
  ]
  const packages = ['framer-motion', '@supabase/supabase-js']

  it('shows summary line with file and package counts', () => {
    render(<OperationSummaryCard files={files} packages={packages} status="complete" />)
    expect(screen.getByText(/2 files/)).toBeInTheDocument()
    expect(screen.getByText(/2 packages/)).toBeInTheDocument()
  })

  it('expands to show installed packages and file list', () => {
    render(<OperationSummaryCard files={files} packages={packages} status="complete" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('framer-motion')).toBeInTheDocument()
    expect(screen.getByText('src/main.tsx')).toBeInTheDocument()
  })

  it('shows progress when running', () => {
    render(<OperationSummaryCard files={files} packages={[]} status="running" />)
    expect(screen.getByText(/assembling/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/operation-summary-card.test.tsx`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```tsx
// src/components/ai-elements/operation-summary-card.tsx
import { ActionCard, ActionCardHeader, ActionCardSummary, ActionCardTabs, ActionCardContent } from './action-card'
import { CheckCircle2, Link2 } from 'lucide-react'

interface OperationSummaryCardProps {
  files: { path: string; category: string }[]
  packages?: string[]
  status: 'running' | 'complete'
  durationMs?: number
}

export function OperationSummaryCard({ files, packages = [], status, durationMs }: OperationSummaryCardProps) {
  const parts: string[] = []
  if (files.length > 0) parts.push(`${files.length} files`)
  if (packages.length > 0) parts.push(`${packages.length} packages`)
  const summary = parts.join(', ')

  const label = status === 'running' ? 'Assembling files...' : `Assembled ${summary}`

  return (
    <ActionCard>
      <ActionCardHeader icon="package" label={label} status={status} durationMs={durationMs} />
      <ActionCardTabs>
        <ActionCardContent tab="details">
          <div className="space-y-3">
            {packages.length > 0 && (
              <div className="space-y-1">
                {packages.map((pkg) => (
                  <div key={pkg} className="flex items-center gap-2 text-sm">
                    <Link2 className="size-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Installed</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{pkg}</code>
                  </div>
                ))}
              </div>
            )}
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f) => (
                  <div key={f.path} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    <span className="font-mono text-xs text-muted-foreground">{f.path}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ActionCardContent>
      </ActionCardTabs>
    </ActionCard>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/operation-summary-card.test.tsx`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/components/ai-elements/operation-summary-card.tsx tests/operation-summary-card.test.tsx
git commit -m "feat: add OperationSummaryCard for grouped file/package display"
```

---

### Task 4: Refactor timeline rendering in `builder-chat.tsx`

This is the core refactor. Replace the per-agent accordion rendering (lines ~1075-1314) with the new operation-type card mapping.

**Files:**
- Modify: `src/components/builder-chat.tsx` (timeline rendering section)

**Step 1: Create the agent-to-operation mapping helper**

Add a helper function at the top of `builder-chat.tsx` (or in a separate util) that maps `agentId` to operation card config:

```tsx
// Add near top of builder-chat.tsx, after imports

const AGENT_CARD_CONFIG: Record<string, {
  icon: string
  runningLabel: string
  completeLabel: (ctx: TimelineEntry & { type: 'agent' }) => string
  component: 'thinking' | 'action' | 'summary' | 'validation'
}> = {
  analyst: {
    icon: 'brain',
    runningLabel: 'Thinking...',
    completeLabel: (ctx) => `Thought for ${ctx.durationMs ? Math.round(ctx.durationMs / 1000) + 's' : '...'}`,
    component: 'thinking',
  },
  architect: {
    icon: 'sparkles',
    runningLabel: 'Designing architecture...',
    completeLabel: () => 'Designed app architecture',
    component: 'action',
  },
  frontend: {
    icon: 'code',
    runningLabel: 'Generating pages...',
    completeLabel: () => 'Generated pages',
    component: 'action',
  },
  backend: {
    icon: 'package',
    runningLabel: 'Assembling files...',
    completeLabel: () => 'Assembled files',
    component: 'summary',
  },
  qa: {
    icon: 'shield',
    runningLabel: 'Validating...',
    completeLabel: () => 'Validation',
    component: 'validation',
  },
}
```

**Step 2: Replace the timeline rendering block**

Find the section in `builder-chat.tsx` that maps over `timelineEvents` and renders `<Agent>` + `<Collapsible>`. Replace it with a new renderer:

```tsx
{/* Timeline — condensed action cards */}
{showTimeline &&
  allTimeline.map((entry, i) => {
    if (entry.type === 'error') {
      return (
        <StackTrace key={`err-${i}`} defaultOpen trace={entry.error}>
          {/* existing error rendering */}
        </StackTrace>
      )
    }

    if (entry.type === 'complete') {
      return (
        <div key={`done-${i}`} className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
          <Rocket className="size-4" />
          <span className="font-medium">Your app is ready!</span>
          {entry.deploymentUrl && (
            <a href={entry.deploymentUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs underline">
              Open preview
            </a>
          )}
        </div>
      )
    }

    // Agent entry → map to operation card
    const config = AGENT_CARD_CONFIG[entry.agent.agentId]
    if (!config) {
      // Fallback for unknown agents (provisioner, repair, reviewer, etc.)
      return (
        <ActionCard key={`agent-${i}`}>
          <ActionCardHeader
            icon="sparkles"
            label={entry.status === 'running' ? `${entry.agent.agentName}...` : entry.agent.agentName}
            status={entry.status}
            durationMs={entry.durationMs}
          />
          {entry.progressMessages && entry.progressMessages.length > 0 && (
            <ActionCardTabs>
              <ActionCardContent tab="details">
                <div className="space-y-1">
                  {entry.progressMessages.map((msg, j) => (
                    <div key={j} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-3.5 text-green-500" />
                      <span className="text-muted-foreground">{msg}</span>
                    </div>
                  ))}
                </div>
              </ActionCardContent>
            </ActionCardTabs>
          )}
        </ActionCard>
      )
    }

    const label = entry.status === 'running'
      ? config.runningLabel
      : config.completeLabel(entry)

    // --- ThinkingCard for analyst ---
    if (config.component === 'thinking') {
      return (
        <ThinkingCard
          key={`agent-${i}`}
          startedAt={entry.ts}
          status={entry.status === 'running' ? 'thinking' : 'complete'}
          durationMs={entry.durationMs}
        >
          {entry.plan
            ? [
                entry.plan.appName && `**${entry.plan.appName}**`,
                entry.plan.appDescription,
                entry.plan.prd,
              ].filter(Boolean).join('\n\n')
            : undefined}
        </ThinkingCard>
      )
    }

    // --- OperationSummaryCard for backend ---
    if (config.component === 'summary') {
      return (
        <OperationSummaryCard
          key={`agent-${i}`}
          files={fileAssembly}
          packages={[]} // TODO: track installed packages from SSE events
          status={entry.status}
          durationMs={entry.durationMs}
        />
      )
    }

    // --- Validation card for qa ---
    if (config.component === 'validation') {
      const passed = validationChecks.filter((c) => c.status === 'passed').length
      const failed = validationChecks.filter((c) => c.status === 'failed').length
      const total = validationChecks.length
      const summary = { passed, failed, skipped: 0, total }

      return (
        <ActionCard key={`agent-${i}`}>
          <ActionCardHeader
            icon="shield"
            label={entry.status === 'running' ? 'Validating...' : `${total === passed ? 'Validation passed' : `${failed} checks failed`}`}
            status={entry.status}
            durationMs={entry.durationMs}
          />
          {total > 0 && (
            <ActionCardTabs>
              <ActionCardContent tab="details">
                <TestResults summary={summary}>
                  <TestResultsProgress />
                  <TestResultsContent>
                    {validationChecks.map((check) => (
                      <Test
                        key={check.name}
                        name={check.name}
                        status={check.status === 'running' ? 'running' : check.status === 'failed' ? 'failed' : 'passed'}
                      />
                    ))}
                  </TestResultsContent>
                </TestResults>
              </ActionCardContent>
            </ActionCardTabs>
          )}
        </ActionCard>
      )
    }

    // --- ActionCard for architect, frontend (default) ---
    return (
      <ActionCard key={`agent-${i}`}>
        <ActionCardHeader icon={config.icon} label={label} status={entry.status} durationMs={entry.durationMs} />
        <ActionCardTabs>
          {/* Details tab */}
          <ActionCardContent tab="details">
            {entry.agent.agentId === 'architect' && (
              <div className="space-y-4">
                {entry.designTokens && <ThemeTokensCard tokens={entry.designTokens as ThemeTokens} />}
                {entry.architecture && <ArchitectureCard spec={entry.architecture} />}
              </div>
            )}
            {entry.agent.agentId === 'frontend' && pageProgress.length > 0 && (
              <PageProgressCard pages={pageProgress} className="border-0 shadow-none" />
            )}
          </ActionCardContent>
          {/* Preview tab (only for architect — shows color swatches) */}
          {entry.agent.agentId === 'architect' && entry.designTokens && (
            <ActionCardContent tab="preview">
              <div className="flex flex-wrap gap-2">
                {Object.entries((entry.designTokens as ThemeTokens).colors).map(([key, color]) => (
                  <div key={key} className="flex flex-col items-center gap-1">
                    <div className="size-8 rounded-md border" style={{ backgroundColor: String(color) }} />
                    <span className="text-[10px] text-muted-foreground">{key}</span>
                  </div>
                ))}
              </div>
            </ActionCardContent>
          )}
        </ActionCardTabs>
      </ActionCard>
    )
  })}
```

**Step 3: Add imports at top of `builder-chat.tsx`**

```tsx
import { ActionCard, ActionCardHeader, ActionCardSummary, ActionCardTabs, ActionCardContent } from '@/components/ai-elements/action-card'
import { ThinkingCard } from '@/components/ai-elements/thinking-card'
import { OperationSummaryCard } from '@/components/ai-elements/operation-summary-card'
```

Remove unused imports for old `Agent`, `AgentContent` components (they're no longer used in the timeline).

**Step 4: Run lint and typecheck**

Run: `bun run lint && bunx tsc --noEmit`
Expected: No errors

**Step 5: Run full test suite**

Run: `bun run test`
Expected: All existing tests still pass

**Step 6: Commit**

```bash
git add src/components/builder-chat.tsx
git commit -m "refactor: replace agent accordions with condensed action cards"
```

---

### Task 5: Add mode badges to `PromptBar`

**Files:**
- Modify: `src/components/prompt-bar.tsx`
- Test: `tests/prompt-bar.test.tsx` (create if not exists)

**Step 1: Write the failing test**

```tsx
// tests/prompt-bar.test.tsx (add to existing or create)
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PromptBar } from '@/components/prompt-bar'

describe('PromptBar mode badges', () => {
  it('shows Edit mode by default', () => {
    render(<PromptBar onSubmit={vi.fn()} />)
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('toggles to Chat mode on click', () => {
    render(<PromptBar onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByText('Chat'))
    expect(screen.getByText('Chat')).toHaveAttribute('data-active', 'true')
  })

  it('toggles to Plan mode on click', () => {
    render(<PromptBar onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByText('Plan'))
    expect(screen.getByText('Plan')).toHaveAttribute('data-active', 'true')
  })

  it('passes mode to onSubmit', async () => {
    const onSubmit = vi.fn()
    render(<PromptBar onSubmit={onSubmit} />)
    // Switch to Plan mode
    fireEvent.click(screen.getByText('Plan'))
    // Type and submit
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Build a todo app' } })
    fireEvent.submit(textarea.closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Build a todo app' }),
      expect.objectContaining({ mode: 'plan' }),
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/prompt-bar.test.tsx`
Expected: FAIL

**Step 3: Add mode state and badge UI to `PromptBar`**

In `prompt-bar.tsx`, add:

```tsx
// At the top of PromptBar component:
const [mode, setMode] = useState<'edit' | 'chat' | 'plan'>('edit')

// In PromptInputFooter, before ModelSelector:
<div className="flex gap-1">
  {(['edit', 'chat', 'plan'] as const).map((m) => (
    <button
      key={m}
      type="button"
      onClick={() => setMode(m)}
      data-active={mode === m ? 'true' : undefined}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
        mode === m
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {m === 'edit' ? 'Edit' : m === 'chat' ? 'Chat' : 'Plan'}
    </button>
  ))}
</div>
```

Update `onSubmit` call to include `mode`:

```tsx
// In the form submit handler, change:
onSubmit(message, { model: selectedModel })
// to:
onSubmit(message, { model: selectedModel, mode })
```

Update `PromptBarProps` to reflect the new `mode` in the callback:

```tsx
interface PromptBarProps {
  onSubmit: (message: PromptInputMessage, options: { model: string; mode: 'edit' | 'chat' | 'plan' }) => void | Promise<void>
  // ... rest unchanged
}
```

**Step 4: Update `builder-chat.tsx` handleSubmit to receive mode**

In `builder-chat.tsx`, update `handleSubmit` signature:

```tsx
const handleSubmit = async (message: PromptInputMessage, options: { model: string; mode: 'edit' | 'chat' | 'plan' }) => {
  if (!message.text?.trim()) return
  setModel(options.model)
  // TODO (Phase 2): Use options.mode to trigger plan mode
  sendChatMessage(message.text)
}
```

**Step 5: Run lint, typecheck, tests**

Run: `bun run lint && bunx tsc --noEmit && bun run test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/components/prompt-bar.tsx src/components/builder-chat.tsx tests/prompt-bar.test.tsx
git commit -m "feat: add Edit/Chat/Plan mode badges to PromptBar"
```

---

### Task 6: Polish — completion quick-actions, generation separators, clarification in ThinkingCard

**Files:**
- Modify: `src/components/builder-chat.tsx`
- Modify: `src/components/ai-elements/thinking-card.tsx`

**Step 1: Add quick-action buttons to completion card**

In the `type === 'complete'` rendering block (Task 4), add buttons:

```tsx
if (entry.type === 'complete') {
  return (
    <div key={`done-${i}`} className="space-y-2 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
        <Rocket className="size-4" />
        Your app is ready!
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {/* scroll preview into view or switch tab */}}
          className="rounded-md border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-500/10 dark:text-green-400"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => {/* switch to code tab */}}
          className="rounded-md border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-500/10 dark:text-green-400"
        >
          Code
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Add generation separators**

Add a separator before the first timeline entry of each generation. Track generation boundaries:

```tsx
{/* Before the timeline map, add a thin separator if this is a subsequent generation */}
{allTimeline.length > 0 && persistedMessages.length > 0 && (
  <div className="mx-4 border-t border-border/50" />
)}
```

**Step 3: Move clarification questions into ThinkingCard**

Currently clarification questions render inside the analyst agent card. Move them to appear after the ThinkingCard. In the analyst `config.component === 'thinking'` branch:

```tsx
if (config.component === 'thinking') {
  return (
    <div key={`agent-${i}`} className="space-y-3">
      <ThinkingCard
        startedAt={entry.ts}
        status={entry.status === 'running' ? 'thinking' : 'complete'}
        durationMs={entry.durationMs}
      >
        {/* ... existing plan content ... */}
      </ThinkingCard>
      {entry.clarificationQuestions && pendingClarification && (
        <ClarificationQuestions
          questions={pendingClarification}
          onSubmit={handleClarificationSubmit}
        />
      )}
    </div>
  )
}
```

**Step 4: Run lint, typecheck, tests**

Run: `bun run lint && bunx tsc --noEmit && bun run test`
Expected: All pass

**Step 5: Visual check**

Run: `bun run dev`
Navigate to a project page, trigger a generation, and verify:
- ThinkingCard shows with elapsed timer
- Architect card shows with Details/Preview tabs
- Frontend card shows page progress inside Details
- Backend card shows grouped files
- QA card shows validation results
- Completion card has Preview/Code buttons
- Mode badges visible in input area

**Step 6: Commit**

```bash
git add src/components/builder-chat.tsx src/components/ai-elements/thinking-card.tsx
git commit -m "feat: add completion quick-actions, generation separators, clarification in ThinkingCard"
```

---

### Task 7: Final lint pass and cleanup

**Files:**
- Modify: `src/components/ai-elements/action-card.tsx` (if lint issues)
- Modify: `src/components/builder-chat.tsx` (remove dead imports)

**Step 1: Run full quality gate**

Run: `bun run lint && bun run format && bunx tsc --noEmit && bun run test`
Fix any issues.

**Step 2: Remove old `Agent` import if unused**

Check if `Agent`, `AgentContent` from `ai-elements/agent.tsx` are still imported in `builder-chat.tsx`. If the old timeline rendering is fully replaced, remove the imports. Note: keep the file itself — it may be used elsewhere.

**Step 3: Run tests one final time**

Run: `bun run test`
Expected: All pass

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: cleanup unused imports and lint fixes"
```

---

## Summary

| Task | What | New Files | Modified Files |
|------|------|-----------|----------------|
| 1 | ActionCard shell | `action-card.tsx`, test | — |
| 2 | ThinkingCard | `thinking-card.tsx`, test | — |
| 3 | OperationSummaryCard | `operation-summary-card.tsx`, test | — |
| 4 | Timeline refactor | — | `builder-chat.tsx` |
| 5 | Mode badges | test | `prompt-bar.tsx`, `builder-chat.tsx` |
| 6 | Polish | — | `builder-chat.tsx`, `thinking-card.tsx` |
| 7 | Cleanup | — | Various |

Total: 3 new component files, 3 new test files, 2 modified files. Pure frontend — zero server changes.
