import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { ClarificationQuestions } from './clarification-questions'
import {
  singleQuestion,
  multipleChoiceQuestion,
  multipleQuestions,
} from './clarification-questions.fixtures'

const meta = {
  title: 'Builder/ClarificationQuestions',
  component: ClarificationQuestions,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    onSubmit: fn(),
  },
} satisfies Meta<typeof ClarificationQuestions>

export default meta
type Story = StoryObj<typeof meta>

export const SingleQuestion: Story = {
  args: {
    questions: singleQuestion,
  },
}

export const MultipleChoiceQuestion: Story = {
  args: {
    questions: multipleChoiceQuestion,
  },
}

/**
 * Multi-step wizard — Next / Back navigation between three questions.
 */
export const MultipleQuestions: Story = {
  args: {
    questions: multipleQuestions,
  },
}

export const Disabled: Story = {
  args: {
    questions: singleQuestion,
    disabled: true,
  },
}

export const InChatContext: Story = {
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-[640px] space-y-4 bg-background p-4">
        <div className="rounded-lg bg-muted px-4 py-3 text-sm">
          Before I start building, I have a few quick questions to make sure the app fits your needs.
        </div>
        <Story />
      </div>
    ),
  ],
  args: {
    questions: multipleQuestions,
  },
}
