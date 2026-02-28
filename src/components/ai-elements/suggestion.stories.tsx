import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Suggestions, Suggestion } from './suggestion'

const meta = {
  title: 'AI/Suggestion',
  component: Suggestions,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Suggestions>

export default meta
type Story = StoryObj<typeof meta>

const defaultSuggestions = [
  'A todo app with authentication',
  'A blog with markdown editor',
  'An e-commerce store with Stripe',
  'A real-time chat application',
]

export const Default: Story = {
  render: () => (
    <div className="w-full max-w-xl">
      <Suggestions>
        {defaultSuggestions.map((s) => (
          <Suggestion key={s} suggestion={s} onClick={fn()} />
        ))}
      </Suggestions>
    </div>
  ),
}

export const SingleSuggestion: Story = {
  render: () => (
    <Suggestions>
      <Suggestion suggestion="Build a landing page" onClick={fn()} />
    </Suggestions>
  ),
}

export const ManyOverflowing: Story = {
  name: 'Many (horizontal scroll)',
  render: () => (
    <div className="w-80">
      <Suggestions>
        {[
          'Todo app',
          'Blog platform',
          'E-commerce store',
          'Chat app',
          'Dashboard',
          'Portfolio site',
          'CRM system',
          'Kanban board',
        ].map((s) => (
          <Suggestion key={s} suggestion={s} onClick={fn()} />
        ))}
      </Suggestions>
    </div>
  ),
}

export const CustomVariants: Story = {
  render: () => (
    <Suggestions>
      <Suggestion suggestion="Default (outline)" variant="outline" onClick={fn()} />
      <Suggestion suggestion="Ghost variant" variant="ghost" onClick={fn()} />
      <Suggestion suggestion="Secondary" variant="secondary" onClick={fn()} />
    </Suggestions>
  ),
}

export const LongSuggestions: Story = {
  render: () => (
    <div className="w-full max-w-2xl">
      <Suggestions>
        {[
          'Build a full-stack social media platform with auth, posts, and real-time notifications',
          'Create an AI-powered code review tool that integrates with GitHub',
          'Design a multi-tenant SaaS dashboard with Stripe billing',
        ].map((s) => (
          <Suggestion key={s} suggestion={s} onClick={fn()} />
        ))}
      </Suggestions>
    </div>
  ),
}
