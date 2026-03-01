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
 *   - PopulatedTimeline / AgentWorking use a StaticChatTimeline stand-in that
 *     composes real ai-elements components without touching useAgentStream.
 *     This follows the same pattern as AppSidebar stories.
 *
 * To fully test streaming states, add:
 *   1. @storybook/addon-mock or msw-storybook-addon
 *   2. Mock SSE endpoint that emits AgentStreamEvent fixtures
 */
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClipboardList, Code2, Cpu, Globe, HardDrive, Palette, Search, Server } from 'lucide-react'
import { AgentHeader } from '@/components/ai-elements/agent-header'
import { ArtifactCard } from '@/components/ai-elements/artifact-card'
import { HitlActions } from '@/components/ai-elements/hitl-actions'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { PlanBlock } from '@/components/ai-elements/plan-block'
import { ToolActivity } from '@/components/ai-elements/tool-activity'
import { PromptBar } from '@/components/prompt-bar'
import {
  architectSteps,
  backendApiSteps,
  backendSchemaSteps,
  designSystemSteps,
  finalBuildSteps,
  frontendSteps,
  infraSteps,
  prdSteps,
  prdWorkingSteps,
  strategyPlaybookSteps,
  taskflowPlan,
} from './chat-column.fixtures'
import { ChatColumn } from './chat-column'

// ── Query client ─────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})

// ── StaticChatTimeline ────────────────────────────────────────────────
// Full agentic-flow prototype sequence rendered without useAgentStream.
// Matches all 8 prototype steps — uses real ToolActivity component for
// collapsible tool summaries.

function StaticChatTimeline() {
  return (
    <div className="flex h-screen w-full flex-col bg-background">
      {/* Scrollable message area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[768px] space-y-6 px-4 py-6">

          {/* 1 — User message */}
          <Message from="user">
            <MessageContent>
              Build me a project management app with kanban boards, team collaboration, task
              assignments, and real-time notifications.
            </MessageContent>
          </Message>

          {/* 2 — Analyst Agent */}
          <AgentHeader
            agentType="analyst"
            name="Analyst Agent"
            timer="8.3s"
            icon={<Search size={14} />}
          >
            <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
              I&apos;ve analyzed your requirements and prepared a project plan:
            </p>
            <PlanBlock title="Project Plan — TaskFlow" items={taskflowPlan} />
          </AgentHeader>

          {/* 3 — HITL → Approved */}
          <HitlActions approved />

          {/* 4 — Product Manager — Strategy Playbook */}
          <AgentHeader
            agentType="pm"
            name="Product Manager"
            timer="12.1s"
            icon={<ClipboardList size={14} />}
          >
            <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Here&apos;s the comprehensive Product Strategy Playbook for TaskFlow.
            </p>
            <ToolActivity steps={strategyPlaybookSteps} className="mb-3" />
            <ArtifactCard
              size="lg"
              variant="doc"
              title="Product Strategy Playbook"
              meta="Document · DOCX"
              onDownload={fn()}
            />
          </AgentHeader>

          {/* HITL → Approved */}
          <HitlActions approved />

          {/* 5 — Product Manager — PRD */}
          <AgentHeader
            agentType="pm"
            name="Product Manager"
            timer="15.4s"
            icon={<ClipboardList size={14} />}
          >
            <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Here&apos;s the Product Requirements Document with detailed user stories and acceptance
              criteria for TaskFlow.
            </p>
            <ToolActivity steps={prdSteps} className="mb-3" />
            <ArtifactCard
              size="lg"
              variant="doc"
              title="Product Requirements Document"
              meta="Document · DOCX"
              onDownload={fn()}
            />
          </AgentHeader>

          {/* HITL → Approved */}
          <HitlActions approved />

          {/* 6 — Designer */}
          <AgentHeader
            agentType="designer"
            name="Designer"
            timer="9.8s"
            icon={<Palette size={14} />}
          >
            <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Here&apos;s the complete Design System for TaskFlow with color palette, typography,
              and component tokens.
            </p>
            <ToolActivity steps={designSystemSteps} className="mb-3" />
            <ArtifactCard
              size="lg"
              variant="design"
              title="TaskFlow Design System"
              meta="Document · Design Tokens"
              onDownload={fn()}
            />
          </AgentHeader>

          {/* HITL → Approved */}
          <HitlActions approved />

          {/* 7 — Architect */}
          <AgentHeader
            agentType="architect"
            name="Architect"
            timer="7.2s"
            icon={<Cpu size={14} />}
          >
            <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
              I&apos;ve assembled the implementation plan and assigned tasks to the development
              team. Track progress in the Project Panel.
            </p>
            <ToolActivity steps={architectSteps} />
          </AgentHeader>

          {/* 8 — Infra Agent */}
          <AgentHeader
            agentType="infra"
            name="Infra Agent"
            timer="4.1s"
            icon={<HardDrive size={14} />}
          >
            <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Sandbox ready.
            </p>
            <ToolActivity steps={infraSteps} />
          </AgentHeader>

          {/* 9 — Backend Agent — Schema */}
          <AgentHeader
            agentType="backend"
            name="Backend Agent"
            timer="6.3s"
            icon={<Server size={14} />}
          >
            <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Database schema created.
            </p>
            <ToolActivity steps={backendSchemaSteps} />
          </AgentHeader>

          {/* 10 — Backend Agent — API routes */}
          <AgentHeader
            agentType="backend"
            name="Backend Agent"
            timer="14.7s"
            icon={<Server size={14} />}
          >
            <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
              API routes complete.
            </p>
            <ToolActivity steps={backendApiSteps} />
          </AgentHeader>

          {/* 11 — Frontend Agent */}
          <AgentHeader
            agentType="frontend"
            name="Frontend Agent"
            timer="18.3s"
            icon={<Code2 size={14} />}
          >
            <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
              UI components complete.
            </p>
            <ToolActivity steps={frontendSteps} />
          </AgentHeader>

          {/* 12 — Final build + deploy tool activity (standalone, not inside an agent) */}
          <ToolActivity steps={finalBuildSteps} />

          {/* 13 — Completion message + compact preview card */}
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            TaskFlow is ready! The app includes kanban boards with drag-and-drop, user
            authentication, task CRUD with assignments, and real-time updates. You can preview
            it live or continue iterating.
          </p>
          <div className="flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-accent/50">
            <Globe size={20} className="shrink-0 text-[oklch(0.6118_0.0713_127.12)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">TaskFlow — Project Management App</p>
              <p className="text-xs text-muted-foreground">React + Hono · 12 files · Live preview</p>
            </div>
            <button
              type="button"
              onClick={fn()}
              className="shrink-0 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Open Preview
            </button>
          </div>

        </div>
      </div>

      {/* Pinned prompt bar */}
      <div className="border-t bg-background px-4 py-3">
        <div className="mx-auto max-w-[768px]">
          <PromptBar
            placeholder="Ask a question or recommend a change..."
            onSubmit={fn()}
            onStop={fn()}
          />
        </div>
      </div>
    </div>
  )
}

// ── StaticChatTimelineWorking ─────────────────────────────────────────
// Same flow up to the PM agent, which shows a "working" in-progress state.

function StaticChatTimelineWorking() {
  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[768px] space-y-6 px-4 py-6">

          {/* 1 — User message */}
          <Message from="user">
            <MessageContent>
              Build me a project management app with kanban boards, team collaboration, task
              assignments, and real-time notifications.
            </MessageContent>
          </Message>

          {/* 2 — Analyst Agent (done) */}
          <AgentHeader
            agentType="analyst"
            name="Analyst Agent"
            timer="8.3s"
            icon={<Search size={14} />}
          >
            <p className="mb-3 text-[13.5px] leading-relaxed text-muted-foreground">
              I&apos;ve analyzed your requirements and prepared a project plan:
            </p>
            <PlanBlock title="Project Plan — TaskFlow" items={taskflowPlan} />
          </AgentHeader>

          {/* 3 — HITL (approved) */}
          <HitlActions approved />

          {/* 4 — Product Manager (working) */}
          <AgentHeader
            agentType="pm"
            name="Product Manager"
            working
            icon={<ClipboardList size={14} />}
          >
            <ToolActivity steps={prdWorkingSteps} />
          </AgentHeader>

        </div>
      </div>

      {/* Pinned prompt bar (disabled while agent is working) */}
      <div className="border-t bg-background px-4 py-3">
        <div className="mx-auto max-w-[768px]">
          <PromptBar
            placeholder="Ask a question or recommend a change..."
            onSubmit={fn()}
            onStop={fn()}
            status="streaming"
          />
        </div>
      </div>
    </div>
  )
}

// ── Meta ──────────────────────────────────────────────────────────────

const meta = {
  title: 'VibeStack/ChatColumn',
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

**PopulatedTimeline** and **AgentWorking** use a \`StaticChatTimeline\`
structural stand-in that composes real \`ai-elements\` components directly,
bypassing \`useAgentStream\` entirely (same pattern as AppSidebar stories).

The stand-in uses the real **ToolActivity** component for collapsible tool
summaries (matching the prototype's expand/collapse behavior) and includes
all agents shown in prototype step 8: Analyst → PM (Strategy Playbook) →
PM (PRD) → Designer → Architect → Infra Agent → Backend Agent (schema) →
Backend Agent (API) → Frontend Agent → final build/deploy → PreviewCard.

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

// ── Stories ───────────────────────────────────────────────────────────

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

/**
 * Full agentic-flow prototype: completed multi-agent conversation for
 * "TaskFlow" — a project management app. Matches all 8 prototype steps.
 *
 * Uses real ToolActivity components with collapsible summaries, all agents
 * from the prototype (PM, Designer, Architect, Infra, Backend x2, Frontend),
 * and a PreviewCard completion card. Uses a StaticChatTimeline stand-in so
 * no SSE connection is required.
 */
export const PopulatedTimeline: Story = {
  render: () => <StaticChatTimeline />,
}

/**
 * Mid-generation state: Analyst is done and approved, Product Manager
 * is actively working (no timer, "Working…" indicator visible).
 * Uses real ToolActivity with a running step.
 */
export const AgentWorking: Story = {
  render: () => <StaticChatTimelineWorking />,
}
