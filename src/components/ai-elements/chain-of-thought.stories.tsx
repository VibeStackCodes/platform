import type { Meta, StoryObj } from '@storybook/react'
import { SearchIcon } from 'lucide-react'
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtImage,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from './chain-of-thought'

const meta = {
  title: 'AI/ChainOfThought',
  component: ChainOfThought,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ChainOfThought>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    defaultOpen: false,
  },
  render: (args) => (
    <ChainOfThought {...args}>
      <ChainOfThoughtHeader>Reasoning steps</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ChainOfThoughtStep label="Analyzing the user request" status="complete" />
        <ChainOfThoughtStep label="Searching for relevant documentation" status="complete" />
        <ChainOfThoughtStep label="Formulating the response" status="active" />
      </ChainOfThoughtContent>
    </ChainOfThought>
  ),
}

export const Open: Story = {
  args: {
    defaultOpen: true,
  },
  render: (args) => (
    <ChainOfThought {...args}>
      <ChainOfThoughtHeader>Chain of Thought</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ChainOfThoughtStep
          label="Understanding requirements"
          description="The user wants a dashboard with real-time metrics and a sidebar navigation."
          status="complete"
        />
        <ChainOfThoughtStep
          label="Identifying components"
          description="MetricsGrid, RecentActivity, Sidebar, Header."
          status="complete"
        />
        <ChainOfThoughtStep
          label="Planning data flow"
          description="Using TanStack Query for server state, Zustand for UI state."
          status="active"
        />
        <ChainOfThoughtStep
          label="Writing the implementation"
          status="pending"
        />
      </ChainOfThoughtContent>
    </ChainOfThought>
  ),
}

export const WithSearchResults: Story = {
  args: {
    defaultOpen: true,
  },
  render: (args) => (
    <ChainOfThought {...args}>
      <ChainOfThoughtHeader>Web Research</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ChainOfThoughtStep
          icon={SearchIcon}
          label="Searching: React 19 concurrent features"
          status="complete"
        >
          <ChainOfThoughtSearchResults>
            <ChainOfThoughtSearchResult>react.dev/blog</ChainOfThoughtSearchResult>
            <ChainOfThoughtSearchResult>developer.mozilla.org</ChainOfThoughtSearchResult>
            <ChainOfThoughtSearchResult>github.com/facebook/react</ChainOfThoughtSearchResult>
          </ChainOfThoughtSearchResults>
        </ChainOfThoughtStep>
        <ChainOfThoughtStep
          icon={SearchIcon}
          label="Searching: useTransition best practices"
          status="active"
        >
          <ChainOfThoughtSearchResults>
            <ChainOfThoughtSearchResult>kentcdodds.com</ChainOfThoughtSearchResult>
          </ChainOfThoughtSearchResults>
        </ChainOfThoughtStep>
      </ChainOfThoughtContent>
    </ChainOfThought>
  ),
}

export const WithImage: Story = {
  args: {
    defaultOpen: true,
  },
  render: (args) => (
    <ChainOfThought {...args}>
      <ChainOfThoughtHeader>Visual Analysis</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ChainOfThoughtStep label="Analyzing the uploaded screenshot" status="complete">
          <ChainOfThoughtImage caption="Dashboard wireframe detected">
            <img
              alt="wireframe"
              src="https://picsum.photos/400/200"
              style={{ maxWidth: '100%', borderRadius: '0.5rem' }}
            />
          </ChainOfThoughtImage>
        </ChainOfThoughtStep>
        <ChainOfThoughtStep label="Identifying UI components from the image" status="active" />
      </ChainOfThoughtContent>
    </ChainOfThought>
  ),
}
