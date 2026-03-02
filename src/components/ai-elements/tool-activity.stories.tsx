import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import type { ToolStep } from '@/hooks/use-agent-stream'
import { ToolActivity } from './tool-activity'

// ── Fixtures ──────────────────────────────────────────────────────────

const now = Date.now()

const completedSteps: ToolStep[] = [
  {
    id: '1',
    tool: 'writeFile',
    label: 'Write App.tsx',
    status: 'complete',
    filePath: 'src/App.tsx',
    durationMs: 245,
    startedAt: now - 4000,
  },
  {
    id: '2',
    tool: 'installPackage',
    label: 'Install @dnd-kit/core',
    status: 'complete',
    durationMs: 3200,
    startedAt: now - 3755,
  },
  {
    id: '3',
    tool: 'runBuild',
    label: 'Build project',
    status: 'complete',
    durationMs: 4100,
    startedAt: now - 555,
  },
  {
    id: '4',
    tool: 'commitAndPush',
    label: 'Commit and push',
    status: 'complete',
    durationMs: 1800,
    startedAt: now - 0,
  },
]

const inProgressSteps: ToolStep[] = [
  {
    id: '1',
    tool: 'writeFile',
    label: 'Write KanbanBoard.tsx',
    status: 'complete',
    filePath: 'src/components/KanbanBoard.tsx',
    durationMs: 312,
    startedAt: now - 5000,
  },
  {
    id: '2',
    tool: 'writeFile',
    label: 'Write TaskCard.tsx',
    status: 'complete',
    filePath: 'src/components/TaskCard.tsx',
    durationMs: 189,
    startedAt: now - 4688,
  },
  {
    id: '3',
    tool: 'writeFile',
    label: 'Write App.tsx',
    status: 'complete',
    filePath: 'src/App.tsx',
    durationMs: 201,
    startedAt: now - 4499,
  },
  {
    id: '4',
    tool: 'runBuild',
    label: 'Build project',
    status: 'running',
    startedAt: now - 2000,
  },
]

const withErrorSteps: ToolStep[] = [
  {
    id: '1',
    tool: 'writeFile',
    label: 'Write App.tsx',
    status: 'complete',
    filePath: 'src/App.tsx',
    durationMs: 198,
    startedAt: now - 3000,
  },
  {
    id: '2',
    tool: 'writeFile',
    label: 'Write KanbanBoard.tsx',
    status: 'complete',
    filePath: 'src/components/KanbanBoard.tsx',
    durationMs: 224,
    startedAt: now - 2802,
  },
  {
    id: '3',
    tool: 'runBuild',
    label: 'Build project',
    status: 'error',
    result: 'Build failed: TS2307 Cannot find module "@dnd-kit/core"',
    durationMs: 1540,
    startedAt: now - 2578,
  },
]

const singleStep: ToolStep[] = [
  {
    id: '1',
    tool: 'createSandbox',
    label: 'Create sandbox environment',
    status: 'running',
    startedAt: now - 800,
  },
]

const withFilePathSteps: ToolStep[] = [
  {
    id: '1',
    tool: 'writeFile',
    label: 'Write App.tsx',
    status: 'complete',
    filePath: 'src/components/App.tsx',
    oldContent: `export function App() {\n  return <div>Hello</div>\n}`,
    newContent: `import { KanbanBoard } from './KanbanBoard'\n\nexport function App() {\n  return (\n    <main className="min-h-screen bg-background">\n      <KanbanBoard />\n    </main>\n  )\n}`,
    durationMs: 310,
    startedAt: now - 2000,
  },
  {
    id: '2',
    tool: 'writeFile',
    label: 'Write KanbanBoard.tsx',
    status: 'complete',
    filePath: 'src/components/KanbanBoard.tsx',
    newContent: `import { useState } from 'react'\n\nexport function KanbanBoard() {\n  const [columns] = useState(['To Do', 'In Progress', 'Done'])\n  return (\n    <div className="flex gap-4 p-6">\n      {columns.map(col => <div key={col} className="rounded-lg border p-3 w-72">{col}</div>)}\n    </div>\n  )\n}`,
    durationMs: 287,
    startedAt: now - 1690,
  },
  {
    id: '3',
    tool: 'runBuild',
    label: 'Build project',
    status: 'complete',
    durationMs: 3870,
    startedAt: now - 1403,
  },
]

// ── Meta ──────────────────────────────────────────────────────────────

const meta = {
  title: 'VibeStack/AI Elements/ToolActivity',
  component: ToolActivity,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    onPanelOpen: fn(),
  },
} satisfies Meta<typeof ToolActivity>

export default meta
type Story = StoryObj<typeof meta>

// ── Stories ───────────────────────────────────────────────────────────

export const AllComplete: Story = {
  args: {
    steps: completedSteps,
  },
}

export const InProgress: Story = {
  args: {
    steps: inProgressSteps,
  },
}

export const WithError: Story = {
  args: {
    steps: withErrorSteps,
  },
}

export const SingleStep: Story = {
  args: {
    steps: singleStep,
  },
}

export const WithFilePaths: Story = {
  args: {
    steps: withFilePathSteps,
  },
}

export const Empty: Story = {
  args: {
    steps: [],
  },
}
