import type { Meta, StoryObj } from '@storybook/react'
import {
  Blocks,
  Box,
  FileText,
  Layout,
  Palette,
  Search,
  Server,
} from 'lucide-react'
import { AGENT_COLORS, AgentHeader, AgentMessage } from './agent-header'
import type { AgentType } from './agent-header'
import { ToolActivity } from './tool-activity'
import { completeSteps } from './tool-activity.fixtures'

// Compound stories use `render` with mixed components (AgentHeader + AgentMessage),
// so we use the broader Meta type rather than Meta<typeof AgentHeader> to avoid
// requiring all AgentHeader props on render-only stories.
const meta: Meta = {
  title: 'AI/AgentHeader',
  component: AgentHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

// ── Icon map ─────────────────────────────────────────────────────────

const AGENT_ICONS: Record<AgentType, React.ReactNode> = {
  analyst: <Search />,
  pm: <FileText />,
  designer: <Palette />,
  architect: <Blocks />,
  backend: <Server />,
  frontend: <Layout />,
  infra: <Box />,
}

// ── Stories ──────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    agentType: 'analyst',
    name: 'Analyst Agent',
    icon: <Search />,
    timer: '8.3s',
    defaultOpen: true,
    children: (
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        I&apos;ve analyzed the project requirements and identified three core user flows: onboarding,
        dashboard navigation, and report generation. The existing API surface supports all three
        without additional endpoints. Recommending a phased rollout starting with onboarding.
      </p>
    ),
  },
}

export const Working: Story = {
  args: {
    agentType: 'designer',
    name: 'Designer',
    icon: <Palette />,
    working: true,
    defaultOpen: true,
    children: (
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        Generating component variants and spacing tokens…
      </p>
    ),
  },
}

export const Collapsed: Story = {
  args: {
    agentType: 'pm',
    name: 'Product Manager',
    icon: <FileText />,
    timer: '4.1s',
    defaultOpen: false,
    children: (
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        Scope confirmed. Prioritising the auth flow for sprint one, deferring analytics to sprint
        two. Three acceptance criteria defined per story.
      </p>
    ),
  },
}

export const AllAgentTypes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(Object.keys(AGENT_COLORS) as AgentType[]).map((type) => (
        <AgentHeader
          key={type}
          agentType={type}
          name={type.charAt(0).toUpperCase() + type.slice(1)}
          icon={AGENT_ICONS[type]}
          timer="2.4s"
          defaultOpen={true}
        >
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Output from the <strong>{type}</strong> agent. Color tint:{' '}
            <code className="font-mono text-[12px]">{AGENT_COLORS[type]}</code>
          </p>
        </AgentHeader>
      ))}
    </div>
  ),
}

export const AgentMessageExample: Story = {
  render: () => (
    <AgentMessage
      agentType="frontend"
      name="Frontend Engineer"
      icon={<Layout />}
      timer="11.7s"
      defaultOpen={true}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Scaffolded the dashboard layout and wired up data fetching via TanStack Query. All
          components are using the shared design tokens from the theme.
        </p>
        <ToolActivity steps={completeSteps} />
      </div>
    </AgentMessage>
  ),
}
