import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { MessageCircleIcon } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
} from './conversation'
import { Message, MessageContent } from './message'
import { sampleMessages, singleExchangeMessages } from './conversation.fixtures'

// NOTE: ConversationScrollButton requires the useStickToBottomContext() hook which
// must be consumed inside a StickToBottom (Conversation) subtree. It is therefore
// included in the full-conversation renders below rather than as a standalone story.

const meta: Meta = {
  title: 'AI/Conversation',
  component: Conversation,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

export const WithMessages: Story = {
  render: () => (
    <div className="relative flex h-[500px] flex-col overflow-hidden rounded-lg border">
      <Conversation>
        <ConversationContent>
          {sampleMessages.map((msg, i) => (
            <Message key={i} from={msg.role as 'user' | 'assistant'}>
              <MessageContent>{msg.content}</MessageContent>
            </Message>
          ))}
        </ConversationContent>
      </Conversation>
    </div>
  ),
}

export const SingleExchange: Story = {
  render: () => (
    <div className="relative flex h-[300px] flex-col overflow-hidden rounded-lg border">
      <Conversation>
        <ConversationContent>
          {singleExchangeMessages.map((msg, i) => (
            <Message key={i} from={msg.role as 'user' | 'assistant'}>
              <MessageContent>{msg.content}</MessageContent>
            </Message>
          ))}
        </ConversationContent>
      </Conversation>
    </div>
  ),
}

export const EmptyState: Story = {
  render: () => (
    <div className="relative flex h-[400px] flex-col overflow-hidden rounded-lg border">
      <Conversation>
        <ConversationContent>
          <ConversationEmptyState
            icon={<MessageCircleIcon className="size-8" />}
            title="Start building"
            description="Describe the app you want to create and I'll generate it for you."
          />
        </ConversationContent>
      </Conversation>
    </div>
  ),
}

export const WithDownload: Story = {
  render: () => (
    <div className="relative flex h-[500px] flex-col overflow-hidden rounded-lg border">
      <Conversation>
        <ConversationContent>
          {sampleMessages.map((msg, i) => (
            <Message key={i} from={msg.role as 'user' | 'assistant'}>
              <MessageContent>{msg.content}</MessageContent>
            </Message>
          ))}
        </ConversationContent>
      </Conversation>
      <ConversationDownload messages={sampleMessages} filename="todo-app-conversation.md" />
    </div>
  ),
}
