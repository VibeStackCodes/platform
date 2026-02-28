import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from './plan'

const meta = {
  title: 'AI/Plan',
  component: Plan,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Plan>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Plan defaultOpen>
      <PlanHeader>
        <div>
          <PlanTitle>Build a Todo Application</PlanTitle>
          <PlanDescription>
            A full-featured todo app with authentication, real-time sync, and drag-and-drop
            reordering built with React 19 and Supabase.
          </PlanDescription>
        </div>
        <PlanAction>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>
      <PlanContent>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>1. Set up Supabase project and configure authentication</li>
          <li>2. Create database schema for todos with user ownership</li>
          <li>3. Build authentication flow (register, login, logout)</li>
          <li>4. Implement todo CRUD operations with optimistic updates</li>
          <li>5. Add real-time sync via Supabase Realtime</li>
          <li>6. Implement drag-and-drop reordering with @dnd-kit</li>
          <li>7. Style with Tailwind CSS and shadcn/ui components</li>
        </ul>
      </PlanContent>
      <PlanFooter>
        <span className="text-xs text-muted-foreground">7 steps</span>
      </PlanFooter>
    </Plan>
  ),
}

export const Streaming: Story = {
  render: () => (
    <Plan defaultOpen isStreaming>
      <PlanHeader>
        <div>
          <PlanTitle>Analyzing your request...</PlanTitle>
          <PlanDescription>
            Planning out the architecture and implementation steps for your application.
          </PlanDescription>
        </div>
        <PlanAction>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>
      <PlanContent>
        <p className="text-sm text-muted-foreground">Generating plan steps...</p>
      </PlanContent>
    </Plan>
  ),
}

export const Collapsed: Story = {
  render: () => (
    <Plan>
      <PlanHeader>
        <div>
          <PlanTitle>Build an E-commerce Dashboard</PlanTitle>
          <PlanDescription>
            Analytics dashboard with sales charts, inventory management, and order tracking.
          </PlanDescription>
        </div>
        <PlanAction>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>
      <PlanContent>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>1. Design database schema for products, orders, and customers</li>
          <li>2. Build REST API endpoints for data retrieval</li>
          <li>3. Create dashboard layout with responsive grid</li>
          <li>4. Implement recharts for sales visualization</li>
          <li>5. Add inventory management table with sorting and filtering</li>
        </ul>
      </PlanContent>
    </Plan>
  ),
}
