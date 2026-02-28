import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import {
  StackTrace,
  StackTraceActions,
  StackTraceCopyButton,
  StackTraceContent,
  StackTraceError,
  StackTraceErrorMessage,
  StackTraceErrorType,
  StackTraceExpandButton,
  StackTraceFrames,
  StackTraceHeader,
} from './stack-trace'
import { typicalTypeError, buildError, networkError } from './stack-trace.fixtures'

const meta: Meta = {
  title: 'AI/StackTrace',
  component: StackTrace,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

function FullStackTrace({ trace, defaultOpen = false }: { trace: string; defaultOpen?: boolean }) {
  return (
    <StackTrace trace={trace} defaultOpen={defaultOpen}>
      <StackTraceHeader>
        <StackTraceError>
          <StackTraceErrorType />
          <StackTraceErrorMessage />
        </StackTraceError>
        <StackTraceActions>
          <StackTraceCopyButton />
          <StackTraceExpandButton />
        </StackTraceActions>
      </StackTraceHeader>
      <StackTraceContent>
        <StackTraceFrames />
      </StackTraceContent>
    </StackTrace>
  )
}

export const TypeError: Story = {
  render: () => <FullStackTrace trace={typicalTypeError} />,
}

export const TypeErrorExpanded: Story = {
  render: () => <FullStackTrace trace={typicalTypeError} defaultOpen />,
}

export const BuildError: Story = {
  render: () => <FullStackTrace trace={buildError} defaultOpen />,
}

export const NetworkError: Story = {
  render: () => <FullStackTrace trace={networkError} />,
}

export const WithFilePathClick: Story = {
  render: () => (
    <StackTrace
      trace={typicalTypeError}
      defaultOpen
      onFilePathClick={fn()}
    >
      <StackTraceHeader>
        <StackTraceError>
          <StackTraceErrorType />
          <StackTraceErrorMessage />
        </StackTraceError>
        <StackTraceActions>
          <StackTraceCopyButton />
          <StackTraceExpandButton />
        </StackTraceActions>
      </StackTraceHeader>
      <StackTraceContent>
        <StackTraceFrames />
      </StackTraceContent>
    </StackTrace>
  ),
}

export const HideInternalFrames: Story = {
  render: () => (
    <StackTrace trace={typicalTypeError} defaultOpen>
      <StackTraceHeader>
        <StackTraceError>
          <StackTraceErrorType />
          <StackTraceErrorMessage />
        </StackTraceError>
        <StackTraceActions>
          <StackTraceCopyButton />
          <StackTraceExpandButton />
        </StackTraceActions>
      </StackTraceHeader>
      <StackTraceContent>
        <StackTraceFrames showInternalFrames={false} />
      </StackTraceContent>
    </StackTrace>
  ),
}
