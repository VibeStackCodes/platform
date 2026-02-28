/**
 * BuilderPage — page-level composition story
 *
 * BuilderPage composes ChatColumn + RightPanel.  ChatColumn internally calls
 * useAgentStream() which attempts SSE fetches, and BuilderPage itself calls
 * useQuery() for sandbox URLs.
 *
 * Context requirements:
 *   - QueryClientProvider    (useQuery for sandbox-urls)
 *   - SSE endpoint           (/api/agent — called by useAgentStream via ChatColumn)
 *
 * Without SSE mocking, mounting BuilderPage with an initialPrompt will attempt
 * a real fetch to /api/agent that fails in Storybook.  Mounting WITHOUT
 * initialPrompt is safe — no fetch is triggered and the empty state renders.
 *
 * What these stories demonstrate:
 *   1. Empty initial state (no prompt, no panel open)
 *   2. Right panel open with code content (panel state controlled via render)
 *   3. Right panel open with a diff view
 *
 * For full interactive stories (streaming, panel transitions, element selection):
 *   1. Add msw-storybook-addon
 *   2. Mock GET /api/projects/:id/sandbox-urls → { previewUrl, codeServerUrl, ... }
 *   3. Mock POST /api/agent → SSE stream of AgentStreamEvent fixtures
 */
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RightPanel } from './right-panel'
import { fn } from '@storybook/test'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
      // Return null immediately to prevent real fetch attempts
      queryFn: async () => null,
    },
  },
})

const sampleCode = `import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function TodoList() {
  const [todos, setTodos] = useState<string[]>([])
  const [input, setInput] = useState('')

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">My Todos</h1>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 rounded border px-3 py-2"
          placeholder="Add a todo..."
        />
        <Button onClick={() => { setTodos([...todos, input]); setInput('') }}>
          Add
        </Button>
      </div>
      <ul className="space-y-2">
        {todos.map((t, i) => <li key={i} className="text-sm">{t}</li>)}
      </ul>
    </div>
  )
}`

/**
 * A simplified BuilderPage shell that does not mount ChatColumn (and therefore
 * does not trigger any SSE fetches).  It renders the split-pane layout with a
 * static left placeholder and a real RightPanel on the right.
 */
function BuilderPageShell({
  panelOpen = false,
  panelContent = null,
}: {
  panelOpen?: boolean
  panelContent?: React.ComponentProps<typeof RightPanel>['content']
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left: static chat placeholder */}
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <svg
              className="h-8 w-8 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <p className="font-medium">Chat Column</p>
            <p className="text-sm text-muted-foreground mt-1">
              ChatColumn is not rendered in these stories to avoid SSE fetch attempts.
            </p>
          </div>
        </div>
      </div>

      {/* Right: real RightPanel */}
      <RightPanel
        isOpen={panelOpen}
        width={50}
        isDragging={false}
        content={panelContent}
        onDragStart={fn()}
        onClose={fn()}
      />
    </div>
  )
}

const meta = {
  title: 'Builder/BuilderPage',
  component: BuilderPageShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
**BuilderPage** is the top-level page component for the app builder.
It composes **ChatColumn** (SSE-driven) and **RightPanel** (resizable).

These stories render a **BuilderPageShell** — a visual stand-in that omits
ChatColumn to avoid live SSE fetch attempts in Storybook.  The RightPanel
is real and exercises all its variants.

To test the full page with streaming:
1. Add \`msw-storybook-addon\`
2. Mock \`GET /api/projects/:id/sandbox-urls\`
3. Mock \`POST /api/agent\` as an SSE stream of \`AgentStreamEvent\` fixtures
        `.trim(),
      },
    },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof BuilderPageShell>

export default meta
type Story = StoryObj<typeof meta>

export const PanelClosed: Story = {
  args: {
    panelOpen: false,
    panelContent: null,
  },
}

export const PanelOpenWithCode: Story = {
  args: {
    panelOpen: true,
    panelContent: {
      type: 'code',
      filename: 'src/components/TodoList.tsx',
      code: sampleCode,
      language: 'tsx',
    },
  },
}

export const PanelOpenWithDiff: Story = {
  args: {
    panelOpen: true,
    panelContent: {
      type: 'diff',
      filename: 'src/components/Header.tsx',
      oldContent: `export function Header() {\n  return <header className="py-4 px-6"><h1>My App</h1></header>\n}`,
      newContent: `export function Header() {\n  return (\n    <header className="bg-primary text-primary-foreground py-4 px-6 shadow">\n      <h1 className="font-bold">My App</h1>\n    </header>\n  )\n}`,
    },
  },
}

export const PanelOpenWithPreview: Story = {
  args: {
    panelOpen: true,
    panelContent: {
      type: 'preview',
      previewUrl: 'https://example.com',
    },
  },
}

export const PanelOpenWithArtifact: Story = {
  args: {
    panelOpen: true,
    panelContent: {
      type: 'artifact',
      title: 'Product Requirements Document',
      content: '# Task Manager\n\nA minimal todo app for individuals.\n\n## Features\n- Create tasks\n- Mark complete\n- Filter by status',
    },
  },
}
