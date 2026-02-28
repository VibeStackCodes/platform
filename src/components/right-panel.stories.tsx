import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
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
  isDragging: false,
  width: 50,
}

const meta = {
  title: 'Builder/RightPanel',
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

export const PreviewWithCodeServer: Story = {
  args: {
    isOpen: true,
    content: {
      type: 'preview',
      previewUrl: 'https://example.com',
    },
    codeServerUrl: 'https://code-server.example.com',
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

export const ArtifactPanel: Story = {
  args: {
    isOpen: true,
    content: {
      type: 'artifact',
      title: 'Product Requirements Document',
      content: `# Task Manager App\n\n## Overview\nA minimal task management app for individuals who want a distraction-free to-do list.\n\n## Core Features\n- Create, edit and delete tasks\n- Mark tasks as complete\n- Filter by status (All / Active / Completed)\n- Persist tasks between sessions (localStorage)\n\n## Non-Goals\n- Team collaboration\n- Due dates and reminders (v2)\n- Integrations with external tools`,
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
