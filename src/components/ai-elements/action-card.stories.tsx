import type { Meta, StoryObj } from '@storybook/react'
import { ActionCard, ActionCardContent, ActionCardHeader, ActionCardSummary, ActionCardTabs } from './action-card'

const meta: Meta = {
  title: 'AI/ActionCard',
  component: ActionCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

export const Running: Story = {
  render: () => (
    <ActionCard>
      <ActionCardHeader
        icon="code"
        label="Generating components..."
        status="running"
        elapsedMs={4200}
      />
      <ActionCardSummary>Writing React components and styles</ActionCardSummary>
    </ActionCard>
  ),
}

export const Complete: Story = {
  render: () => (
    <ActionCard>
      <ActionCardHeader
        icon="sparkles"
        label="Code generation complete"
        status="complete"
        durationMs={12430}
      />
      <ActionCardSummary>Generated 8 files across 3 directories</ActionCardSummary>
    </ActionCard>
  ),
}

export const WithTabs: Story = {
  render: () => (
    <ActionCard>
      <ActionCardHeader
        icon="brain"
        label="Architecture analysis"
        status="complete"
        durationMs={3100}
      />
      <ActionCardTabs>
        <ActionCardContent tab="details">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Analyzed the project requirements and designed the following architecture:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>React 19 SPA with TanStack Router</li>
              <li>Supabase for auth and real-time database</li>
              <li>Tailwind CSS v4 with shadcn/ui</li>
              <li>Zustand for client-side state</li>
            </ul>
          </div>
        </ActionCardContent>
      </ActionCardTabs>
    </ActionCard>
  ),
}

export const PackageInstall: Story = {
  render: () => (
    <ActionCard>
      <ActionCardHeader
        icon="package"
        label="Installing dependencies"
        status="complete"
        durationMs={8700}
      />
      <ActionCardSummary>Installed 4 packages</ActionCardSummary>
      <ActionCardTabs>
        <ActionCardContent tab="details">
          <ul className="space-y-1 text-sm font-mono text-muted-foreground">
            <li>@dnd-kit/core@6.1.0</li>
            <li>@dnd-kit/sortable@8.0.0</li>
            <li>@dnd-kit/utilities@3.2.2</li>
            <li>date-fns@3.6.0</li>
          </ul>
        </ActionCardContent>
      </ActionCardTabs>
    </ActionCard>
  ),
}

export const SecurityScan: Story = {
  render: () => (
    <ActionCard>
      <ActionCardHeader
        icon="shield"
        label="Security scan passed"
        status="complete"
        durationMs={1200}
      />
      <ActionCardSummary>No vulnerabilities detected in 47 packages</ActionCardSummary>
    </ActionCard>
  ),
}
