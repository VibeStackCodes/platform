/**
 * ChatColumn — context-heavy story
 *
 * ChatColumn calls useAgentStream() which internally:
 *   - Manages SSE connections to /api/agent
 *   - Stores messages via useState / useRef
 *   - Calls onSandboxReady, onGenerationComplete, etc.
 *
 * There are NO external context dependencies (no useAuth, no router) — the
 * component accepts all runtime data via props and the useAgentStream hook.
 * However, the hook will attempt to POST to /api/agent on mount if
 * initialPrompt is provided, which will fail in Storybook without mocking.
 *
 * Strategy:
 *   - Mount ChatColumn with no initialPrompt to avoid the SSE fetch on mount.
 *   - The empty state ("Start building") renders correctly without any fetch.
 *   - Stories document the full prop surface so interactive stories can be
 *     added once the SSE hook is mockable (e.g., via MSW Storybook addon).
 *
 * To fully test streaming states, add:
 *   1. @storybook/addon-mock or msw-storybook-addon
 *   2. Mock SSE endpoint that emits AgentStreamEvent fixtures
 */
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatColumn } from './chat-column'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})

const meta = {
  title: 'Builder/ChatColumn',
  component: ChatColumn,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
**ChatColumn** is the main chat + timeline panel in the builder UI.

It uses \`useAgentStream()\` to manage SSE connections, messages, timeline
events, and clarification flows.  In Storybook the SSE fetch is avoided by
not providing an \`initialPrompt\` — the component renders its empty state.

For streaming state stories, add MSW or a similar fetch-intercepting addon and
emit \`AgentStreamEvent\` fixtures over a mocked SSE response.
        `.trim(),
      },
    },
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="flex h-screen w-full">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    projectId: 'story-project-123',
    onSandboxReady: fn(),
    onPanelOpen: fn(),
    onEditComplete: fn(),
    onGenerationComplete: fn(),
  },
} satisfies Meta<typeof ChatColumn>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Empty state — shown when no messages have been sent yet.
 * No SSE fetch is triggered (no initialPrompt).
 */
export const EmptyState: Story = {
  args: {
    projectId: 'story-project-empty',
  },
}

/**
 * With an element selected for editing — the prompt bar placeholder
 * changes to reflect the editing context.
 */
export const WithSelectedElement: Story = {
  args: {
    projectId: 'story-project-edit',
    selectedElement: {
      fileName: 'src/components/Hero.tsx',
      lineNumber: 12,
      columnNumber: 4,
      tagName: 'h1',
      className: 'text-4xl font-bold',
      textContent: 'Welcome to my app',
      tailwindClasses: ['text-4xl', 'font-bold'],
      rect: { x: 100, y: 200, width: 400, height: 60 },
    },
  },
}
