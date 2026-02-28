import type { Meta, StoryObj } from '@storybook/react'
import { OperationSummaryCard } from './operation-summary-card'

const meta = {
  title: 'AI/OperationSummaryCard',
  component: OperationSummaryCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof OperationSummaryCard>

export default meta
type Story = StoryObj<typeof meta>

const sampleFiles = [
  { path: 'src/main.tsx', category: 'entry' },
  { path: 'src/routes/__root.tsx', category: 'route' },
  { path: 'src/routes/index.tsx', category: 'route' },
  { path: 'src/components/todo-list.tsx', category: 'component' },
  { path: 'src/components/todo-item.tsx', category: 'component' },
  { path: 'src/components/add-todo.tsx', category: 'component' },
  { path: 'src/lib/supabase.ts', category: 'lib' },
  { path: 'src/lib/queries.ts', category: 'lib' },
]

const samplePackages = ['@dnd-kit/core', '@dnd-kit/sortable', 'date-fns']

export const Running: Story = {
  args: {
    files: sampleFiles.slice(0, 3),
    status: 'running',
  },
}

export const Complete: Story = {
  args: {
    files: sampleFiles,
    status: 'complete',
    durationMs: 15200,
  },
}

export const WithPackages: Story = {
  args: {
    files: sampleFiles,
    packages: samplePackages,
    status: 'complete',
    durationMs: 22800,
  },
}

export const PackagesOnly: Story = {
  args: {
    files: [],
    packages: samplePackages,
    status: 'complete',
    durationMs: 8700,
  },
}

export const Empty: Story = {
  args: {
    files: [],
    packages: [],
    status: 'complete',
    durationMs: 100,
  },
}
