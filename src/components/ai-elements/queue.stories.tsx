import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { TrashIcon } from 'lucide-react'
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemContent,
  QueueItemDescription,
  QueueItemFile,
  QueueItemImage,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from './queue'

const meta = {
  title: 'AI/Queue',
  component: Queue,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Queue>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Queue style={{ maxWidth: 400 }}>
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel count={3} label="pending tasks" />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator />
                <QueueItemContent>Generate landing page components</QueueItemContent>
                <QueueItemActions>
                  <QueueItemAction onClick={fn()}>
                    <TrashIcon size={12} />
                  </QueueItemAction>
                </QueueItemActions>
              </div>
            </QueueItem>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator />
                <QueueItemContent>Set up authentication flow</QueueItemContent>
                <QueueItemActions>
                  <QueueItemAction onClick={fn()}>
                    <TrashIcon size={12} />
                  </QueueItemAction>
                </QueueItemActions>
              </div>
            </QueueItem>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator />
                <QueueItemContent>Configure Stripe integration</QueueItemContent>
                <QueueItemActions>
                  <QueueItemAction onClick={fn()}>
                    <TrashIcon size={12} />
                  </QueueItemAction>
                </QueueItemActions>
              </div>
            </QueueItem>
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  ),
}

export const WithCompletedItems: Story = {
  render: () => (
    <Queue style={{ maxWidth: 400 }}>
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel count={2} label="completed" />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator completed />
                <QueueItemContent completed>Initialize project scaffold</QueueItemContent>
              </div>
              <QueueItemDescription completed>Done in 2.3s</QueueItemDescription>
            </QueueItem>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator completed />
                <QueueItemContent completed>Install dependencies</QueueItemContent>
              </div>
            </QueueItem>
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel count={2} label="pending" />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator />
                <QueueItemContent>Build dashboard page</QueueItemContent>
              </div>
            </QueueItem>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator />
                <QueueItemContent>Write unit tests</QueueItemContent>
              </div>
            </QueueItem>
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  ),
}

export const WithAttachments: Story = {
  render: () => (
    <Queue style={{ maxWidth: 400 }}>
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel count={1} label="queued message" />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator />
                <QueueItemContent>Update design to match this wireframe</QueueItemContent>
              </div>
              <div style={{ marginLeft: 20 }}>
                <QueueItemImage src="https://picsum.photos/32/32" alt="wireframe" />
                <QueueItemFile>wireframe.fig</QueueItemFile>
              </div>
            </QueueItem>
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  ),
}

export const WithDescriptions: Story = {
  render: () => (
    <Queue style={{ maxWidth: 420 }}>
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel count={3} label="tasks" />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator />
                <QueueItemContent>Implement authentication</QueueItemContent>
              </div>
              <QueueItemDescription>
                Add Supabase Auth with email and Google OAuth
              </QueueItemDescription>
            </QueueItem>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator />
                <QueueItemContent>Create dashboard UI</QueueItemContent>
              </div>
              <QueueItemDescription>
                MetricsGrid, RecentActivity, Sidebar layout
              </QueueItemDescription>
            </QueueItem>
            <QueueItem>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QueueItemIndicator />
                <QueueItemContent>Set up deployment</QueueItemContent>
              </div>
              <QueueItemDescription>Configure Vercel CI/CD pipeline</QueueItemDescription>
            </QueueItem>
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  ),
}
