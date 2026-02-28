import type { Meta, StoryObj } from '@storybook/react'
import { DiffViewer } from './diff-viewer'
import { oldComponentContent, newComponentContent, newFileContent } from './diff-viewer.fixtures'

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
    filename: 'src/components/ui/button.tsx',
    oldContent: oldComponentContent,
    newContent: newComponentContent,
  },
}

export const NewFile: Story = {
  args: {
    filename: 'src/main.tsx',
    newContent: newFileContent,
  },
}

export const SmallEdit: Story = {
  args: {
    filename: 'src/lib/utils.ts',
    oldContent: `export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}`,
    newContent: `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}`,
  },
}
