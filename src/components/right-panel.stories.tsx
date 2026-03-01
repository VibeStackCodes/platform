import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { useRef, useState } from 'react'
import { CheckCircle2, Code2, Download, Eye, FileText, Rocket, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebouncedSave } from '@/hooks/use-debounced-save'
import { SaveIndicator } from '@/components/save-indicator'
import { RightPanel } from './right-panel'

const sampleCode = `import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div className="flex items-center gap-4">
      <Button onClick={() => setCount(c => c - 1)}>-</Button>
      <span className="text-2xl font-bold tabular-nums">{count}</span>
      <Button onClick={() => setCount(c => c + 1)}>+</Button>
    </div>
  )
}`

const oldCode = `export function Header() {
  return (
    <header className="bg-white py-4 px-6">
      <h1 className="text-xl font-semibold">My App</h1>
    </header>
  )
}`

const newCode = `export function Header() {
  return (
    <header className="bg-primary text-primary-foreground py-4 px-6 shadow-sm">
      <h1 className="text-xl font-bold tracking-tight">My App</h1>
      <p className="text-sm text-primary-foreground/70">Powered by VibeStack</p>
    </header>
  )
}`

const sharedArgs = {
  onDragStart: fn(),
  onClose: fn(),
  onSave: fn(),
  isDragging: false,
  width: 50,
}

const meta = {
  title: 'VibeStack/RightPanel',
  component: RightPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="flex h-screen w-full">
        {/* Simulated left column */}
        <div className="flex-1 bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">Chat column (left)</p>
        </div>
        {/* Right panel fills its natural width */}
        <Story />
      </div>
    ),
  ],
  args: {
    ...sharedArgs,
  },
} satisfies Meta<typeof RightPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
  args: {
    isOpen: false,
    content: null,
  },
}

export const PreviewPanel: Story = {
  args: {
    isOpen: true,
    content: {
      type: 'preview',
      previewUrl: 'https://example.com',
    },
  },
}


export const CodePanel: Story = {
  args: {
    isOpen: true,
    content: {
      type: 'code',
      filename: 'src/components/Counter.tsx',
      code: sampleCode,
      language: 'tsx',
    },
  },
}

export const DiffPanel: Story = {
  args: {
    isOpen: true,
    content: {
      type: 'diff',
      filename: 'src/components/Header.tsx',
      oldContent: oldCode,
      newContent: newCode,
    },
  },
}

export const DiffPanelNewFile: Story = {
  name: 'DiffPanel (new file)',
  args: {
    isOpen: true,
    content: {
      type: 'diff',
      filename: 'src/components/Footer.tsx',
      oldContent: undefined,
      newContent: `export function Footer() {\n  return <footer className="py-8 text-center text-sm text-muted-foreground">Built with VibeStack</footer>\n}`,
    },
  },
}

const prdContent = `TaskFlow — PRD
Detailed product requirements with user stories and acceptance criteria.

1. Authentication

US-001: Email Sign Up
As a new user, I want to create an account with email and password.
  • Email validation with confirmation
  • Password min 8 chars, 1 uppercase, 1 number
  • Rate limit: 5 attempts/min

US-002: OAuth Login
As a user, I want to sign in with Google/GitHub.

2. Kanban Board

US-003: Create Board
As a team lead, I want to create a new board with custom columns.
  • Default columns: To Do, In Progress, Done
  • Custom column names and colors
  • WIP limits per column

US-004: Drag & Drop Cards
As a user, I want to drag task cards between columns to update their status.`

/**
 * Prototype steps 3-4: Document viewer panel.
 * Editable paper-like artifact body with auto-save indicator in the header.
 * Type in the document body to see the spinner → checkmark transition.
 */
export const DocumentPanel: Story = {
  args: {
    isOpen: true,
    content: {
      type: 'artifact',
      title: 'Product Requirements Document',
      content: prdContent,
    },
  },
}

export const WhileDragging: Story = {
  args: {
    isOpen: true,
    isDragging: true,
    content: {
      type: 'code',
      filename: 'src/components/Counter.tsx',
      code: sampleCode,
      language: 'tsx',
    },
  },
}

export const NarrowWidth: Story = {
  args: {
    isOpen: true,
    width: 30,
    content: {
      type: 'preview',
      previewUrl: 'https://example.com',
    },
  },
}

// ---------------------------------------------------------------------------
// Structural stand-ins — match panel modes from the agentic-flow prototype
// that the RightPanel component does not yet expose as panel types.
// These render the visual structure directly (no RightPanel wrapper) so
// Storybook shows an accurate preview of the intended UI without requiring
// upstream component changes.
// ---------------------------------------------------------------------------

function StaticProgressPanel({ onClose }: { onClose: () => void }) {
  const tasks = [
    { label: 'Set up sandbox environment', status: 'done' as const },
    { label: 'Create database schema', status: 'done' as const },
    { label: 'Build API routes & auth', status: 'active' as const },
    { label: 'Build UI components', status: 'pending' as const },
    { label: 'Implement real-time sync', status: 'pending' as const },
    { label: 'Add notifications system', status: 'pending' as const },
    { label: 'Run build & deploy preview', status: 'pending' as const },
  ]

  const artifacts = [
    { title: 'Product Strategy Playbook', badge: 'PM' },
    { title: 'Product Requirements Doc', badge: 'PM' },
    { title: 'TaskFlow Design System', badge: 'Design' },
  ]

  return (
    <div className="flex h-full w-[400px] flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-600" />
          <span className="text-sm font-semibold">Progress</span>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted">
          <X size={16} />
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-1">
          {tasks.map((task, i) => (
            <div key={task.label} className="flex items-start gap-3 py-2">
              {/* Status indicator */}
              <div className="relative mt-0.5 flex flex-col items-center">
                {task.status === 'done' && (
                  <div className="flex size-6 items-center justify-center rounded-full bg-green-600 text-white">
                    <CheckCircle2 size={14} />
                  </div>
                )}
                {task.status === 'active' && (
                  <div className="flex size-6 items-center justify-center rounded-full border-2 border-blue-500 bg-blue-500 text-white">
                    <span className="text-[10px] font-bold">{i + 1}</span>
                  </div>
                )}
                {task.status === 'pending' && (
                  <div className="flex size-6 items-center justify-center rounded-full border-2 border-muted-foreground/20 text-muted-foreground/40">
                    <span className="text-[10px] font-medium">{i + 1}</span>
                  </div>
                )}
                {/* Vertical connector line (except last) */}
                {i < tasks.length - 1 && (
                  <div
                    className={cn(
                      'absolute top-7 h-6 w-0.5',
                      task.status === 'done' ? 'bg-green-600' : 'bg-muted-foreground/15',
                    )}
                  />
                )}
              </div>
              {/* Label */}
              <span
                className={cn(
                  'text-sm',
                  task.status === 'done' && 'text-muted-foreground/50 line-through',
                  task.status === 'active' && 'font-medium text-foreground',
                  task.status === 'pending' && 'text-muted-foreground',
                )}
              >
                {task.label}
              </span>
            </div>
          ))}
        </div>

        {/* Artifacts section */}
        <div className="mt-8 border-t pt-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText size={14} className="text-muted-foreground" />
            <span className="text-sm font-semibold">Artifacts</span>
          </div>
          <div className="space-y-2">
            {artifacts.map((a) => (
              <div key={a.title} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <FileText size={14} className="text-muted-foreground" />
                  <span className="text-sm">{a.title}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{a.badge}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Prototype steps 6-7: right panel showing numbered tasks with status
 * indicators and a connected-line stepper, plus an artifacts list below.
 * Structural stand-in — rendered directly without the RightPanel wrapper.
 */
export const ProgressPanel: Story = {
  args: {
    isOpen: true,
    content: null,
  },
  render: () => (
    <div className="flex h-screen w-full">
      <div className="flex-1 bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">Chat column (left)</p>
      </div>
      <StaticProgressPanel onClose={fn()} />
    </div>
  ),
  parameters: { layout: 'fullscreen' },
}

// ---------------------------------------------------------------------------

function StaticDesignSystemPanel({ onClose }: { onClose: () => void }) {
  const primaryColors = [
    { shade: '50', hex: '#EEF2FF', color: 'oklch(0.96 0.02 277)' },
    { shade: '100', hex: '#E0E7FF', color: 'oklch(0.92 0.04 277)' },
    { shade: '200', hex: '#C7D2FE', color: 'oklch(0.85 0.08 277)' },
    { shade: '500', hex: '#6366F1', color: 'oklch(0.55 0.18 277)' },
    { shade: '900', hex: '#312E81', color: 'oklch(0.30 0.12 277)' },
  ]

  const neutralColors = [
    { shade: '50', hex: '#FAF9F5', color: 'oklch(0.98 0.01 90)' },
    { shade: '100', hex: '#F0EDE6', color: 'oklch(0.94 0.01 80)' },
    { shade: '200', hex: '#E8E6DC', color: 'oklch(0.92 0.02 85)' },
    { shade: '500', hex: '#6B6960', color: 'oklch(0.50 0.02 85)' },
    { shade: '900', hex: '#141413', color: 'oklch(0.15 0.01 85)' },
  ]

  const semanticColors = [
    { name: 'Success', hex: '#16A34A', color: 'oklch(0.55 0.16 145)' },
    { name: 'Warning', hex: '#EAB308', color: 'oklch(0.80 0.16 85)' },
    { name: 'Error', hex: '#DC2626', color: 'oklch(0.55 0.22 27)' },
    { name: 'Info', hex: '#2563EB', color: 'oklch(0.55 0.20 260)' },
  ]

  return (
    <div className="flex h-full w-[440px] flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">Design System</span>
        <div className="flex items-center gap-2">
          <Download size={16} className="cursor-pointer text-muted-foreground hover:text-foreground" />
          <CheckCircle2 size={16} className="cursor-pointer text-muted-foreground hover:text-foreground" />
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* Light/Dark toggle */}
        <div className="mb-6 flex w-fit gap-1 rounded-lg bg-muted p-1">
          <button type="button" className="rounded-md bg-background px-3 py-1 text-sm font-medium shadow-sm">
            Light
          </button>
          <button type="button" className="rounded-md px-3 py-1 text-sm text-muted-foreground">
            Dark
          </button>
        </div>

        {/* Colors section */}
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Colors</p>

        {/* Primary */}
        <p className="mb-2 text-sm font-medium text-muted-foreground">Primary (Indigo)</p>
        <div className="mb-4 flex gap-2">
          {primaryColors.map((c) => (
            <div key={c.shade} className="text-center">
              <div className="mb-1 size-12 rounded-lg" style={{ backgroundColor: c.color }} />
              <p className="text-[10px] text-muted-foreground">{c.shade}</p>
              <p className="text-[10px] text-muted-foreground/60">{c.hex}</p>
            </div>
          ))}
        </div>

        {/* Neutral */}
        <p className="mb-2 text-sm font-medium text-muted-foreground">Neutral (Warm)</p>
        <div className="mb-6 flex gap-2">
          {neutralColors.map((c) => (
            <div key={c.shade} className="text-center">
              <div className="mb-1 size-12 rounded-lg border" style={{ backgroundColor: c.color }} />
              <p className="text-[10px] text-muted-foreground">{c.shade}</p>
              <p className="text-[10px] text-muted-foreground/60">{c.hex}</p>
            </div>
          ))}
        </div>

        {/* Semantic */}
        <p className="mb-3 text-sm font-medium text-muted-foreground">Semantic</p>
        <div className="mb-8 grid grid-cols-2 gap-2">
          {semanticColors.map((c) => (
            <div key={c.name} className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
              <div className="size-5 rounded-full" style={{ backgroundColor: c.color }} />
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-[11px] text-muted-foreground">{c.hex}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Typography */}
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Typography</p>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <span className="text-xs text-muted-foreground">Display</span>
            <p className="mt-1 font-serif text-3xl font-semibold">TaskFlow Pro</p>
            <span className="text-[11px] text-muted-foreground">DM Serif / 32px</span>
          </div>
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <span className="text-xs text-muted-foreground">Heading</span>
            <p className="mt-1 text-xl font-semibold">Project Dashboard</p>
            <span className="text-[11px] text-muted-foreground">Inter / 20px</span>
          </div>
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <span className="text-xs text-muted-foreground">Body</span>
            <p className="mt-1 text-sm">The quick brown fox jumps over the lazy dog.</p>
            <span className="text-[11px] text-muted-foreground">Inter / 14px</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Prototype step 5: right panel showing the generated design system —
 * color palettes (primary, neutral, semantic) and typography scale.
 * Includes a light/dark mode toggle and download/apply actions in the header.
 * Structural stand-in — rendered directly without the RightPanel wrapper.
 */
export const DesignSystemPanel: Story = {
  args: {
    isOpen: true,
    content: null,
  },
  render: () => (
    <div className="flex h-screen w-full">
      <div className="flex-1 bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">Chat column (left)</p>
      </div>
      <StaticDesignSystemPanel onClose={fn()} />
    </div>
  ),
  parameters: { layout: 'fullscreen' },
}

// ---------------------------------------------------------------------------

const kanbanCode = `import { useState } from 'react'
import { DndContext } from '@dnd-kit/core'

export function KanbanBoard() {
  const [columns, setColumns] = useState([
    { id: 'todo', title: 'To Do', cards: [] },
    { id: 'progress', title: 'In Progress', cards: [] },
    { id: 'done', title: 'Done', cards: [] },
  ])

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 p-6">
        {columns.map(col => (
          <Column key={col.id} {...col} />
        ))}
      </div>
    </DndContext>
  )
}`

function StaticPreviewWithTabsPanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview')
  const codeRef = useRef<HTMLDivElement>(null)
  const { status: saveStatus, trigger: triggerSave } = useDebouncedSave({
    onSave: fn(),
  })

  return (
    <div className="flex h-full w-[50%] min-w-[400px] flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={cn(
                'rounded-md px-2 py-1',
                activeTab === 'preview' ? 'bg-background shadow-sm' : 'text-muted-foreground',
              )}
            >
              <Eye size={14} />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={cn(
                'rounded-md px-2 py-1',
                activeTab === 'code' ? 'bg-background shadow-sm' : 'text-muted-foreground',
              )}
            >
              <Code2 size={14} />
            </button>
          </div>
          {/* Project name */}
          <span className="text-sm font-medium">TaskFlow</span>
          <span className="text-xs text-muted-foreground">React</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
          >
            <Rocket size={12} />
            Deploy
          </button>
          <SaveIndicator status={saveStatus} />
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'preview' ? (
          <div className="flex h-full items-center justify-center bg-white">
            <div className="w-full max-w-md space-y-4 p-8">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-green-600" />
                <h2 className="text-lg font-semibold">TaskFlow</h2>
              </div>
              <div className="flex gap-2">
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Board
                </span>
                <span className="rounded-full bg-muted px-3 py-1 text-xs">List</span>
                <span className="rounded-full bg-muted px-3 py-1 text-xs">Calendar</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">To Do</p>
                  <div className="mt-2 space-y-2">
                    <div className="rounded border p-2 text-xs">Add notification preferences</div>
                    <div className="rounded border p-2 text-xs">Dark mode toggle</div>
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">In Progress</p>
                  <div className="mt-2 space-y-2">
                    <div className="rounded border p-2 text-xs">Real-time board sync</div>
                    <div className="rounded border p-2 text-xs">Keyboard shortcuts</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full">
            {/* File tree */}
            <div className="w-48 border-r bg-muted/30 px-2 py-3">
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase text-muted-foreground">Files</p>
              <div className="space-y-0.5 text-xs">
                <div className="rounded bg-muted px-2 py-1 font-medium">App.tsx</div>
                <div className="px-2 py-1 text-muted-foreground">KanbanBoard.tsx</div>
                <div className="px-2 py-1 text-muted-foreground">TaskCard.tsx</div>
                <div className="px-2 py-1 text-muted-foreground">Layout.tsx</div>
                <div className="px-2 py-1 text-muted-foreground">auth.ts</div>
                <div className="px-2 py-1 text-muted-foreground">tasks.ts</div>
              </div>
            </div>
            {/* Editable code editor — matches CodePanel formatting */}
            <div className="min-h-0 flex-1 overflow-auto">
              <div
                ref={codeRef}
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                onInput={() => {
                  if (codeRef.current) triggerSave(codeRef.current.textContent ?? '')
                }}
                className="h-full p-4 font-mono text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap outline-none"
              >
                {kanbanCode}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Prototype step 8: right panel with a Preview/Code tab toggle, project name,
 * and a Deploy button in the header. The preview tab shows a static kanban
 * mockup; the code tab shows a file tree and syntax-highlighted editor.
 * Structural stand-in — rendered directly without the RightPanel wrapper.
 */
export const PreviewWithTabs: Story = {
  args: {
    isOpen: true,
    content: null,
  },
  render: () => (
    <div className="flex h-screen w-full">
      <div className="flex-1 bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">Chat column (left)</p>
      </div>
      <StaticPreviewWithTabsPanel onClose={fn()} />
    </div>
  ),
  parameters: { layout: 'fullscreen' },
}
