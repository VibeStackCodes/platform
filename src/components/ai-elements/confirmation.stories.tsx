import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from './confirmation'

const meta = {
  title: 'AI/Confirmation',
  component: Confirmation,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Confirmation>

export default meta
type Story = StoryObj<typeof meta>

// Approval is pending — shows the request UI with accept/reject buttons
export const AwaitingApproval: Story = {
  args: {
    approval: { id: 'tool-call-1' },
    state: 'approval-requested',
  },
  render: (args) => (
    <div className="w-full max-w-md">
      <Confirmation {...args}>
        <ConfirmationTitle>
          Allow the agent to run: <code>rm -rf dist/</code>?
        </ConfirmationTitle>
        <ConfirmationRequest>
          <ConfirmationActions>
            <ConfirmationAction variant="outline" onClick={fn()}>
              Deny
            </ConfirmationAction>
            <ConfirmationAction onClick={fn()}>
              Allow
            </ConfirmationAction>
          </ConfirmationActions>
        </ConfirmationRequest>
      </Confirmation>
    </div>
  ),
}

// Approved state
export const Approved: Story = {
  args: {
    approval: { id: 'tool-call-2', approved: true },
    state: 'approval-responded',
  },
  render: (args) => (
    <div className="w-full max-w-md">
      <Confirmation {...args}>
        <ConfirmationTitle>
          Command execution approved.
        </ConfirmationTitle>
        <ConfirmationAccepted>
          <p className="text-sm text-green-600">The agent has been granted permission to proceed.</p>
        </ConfirmationAccepted>
      </Confirmation>
    </div>
  ),
}

// Rejected state
export const Rejected: Story = {
  args: {
    approval: { id: 'tool-call-3', approved: false, reason: 'Not safe to run in production' },
    state: 'approval-responded',
  },
  render: (args) => (
    <div className="w-full max-w-md">
      <Confirmation {...args}>
        <ConfirmationTitle>
          Command execution denied.
        </ConfirmationTitle>
        <ConfirmationRejected>
          <p className="text-sm text-red-600">The operation was denied by the user.</p>
        </ConfirmationRejected>
      </Confirmation>
    </div>
  ),
}

// Denied output state
export const OutputDenied: Story = {
  args: {
    approval: { id: 'tool-call-4', approved: false },
    state: 'output-denied',
  },
  render: (args) => (
    <div className="w-full max-w-md">
      <Confirmation {...args}>
        <ConfirmationTitle>
          Tool output was denied.
        </ConfirmationTitle>
        <ConfirmationRejected>
          <p className="text-sm text-orange-600">This tool call was not executed.</p>
        </ConfirmationRejected>
      </Confirmation>
    </div>
  ),
}

// Hidden because state is input-streaming (Confirmation returns null)
export const HiddenDuringStreaming: Story = {
  name: 'Hidden (input-streaming state)',
  args: {
    approval: { id: 'tool-call-5', approved: true },
    state: 'input-streaming',
  },
  render: (args) => (
    <div className="w-full max-w-md space-y-2">
      <p className="text-xs text-muted-foreground">
        The Confirmation below is hidden — state is &quot;input-streaming&quot;:
      </p>
      <Confirmation {...args}>
        <ConfirmationTitle>You should not see this.</ConfirmationTitle>
      </Confirmation>
      <p className="text-xs text-muted-foreground italic">(nothing rendered above)</p>
    </div>
  ),
}
