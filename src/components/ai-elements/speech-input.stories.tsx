import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { SpeechInput } from './speech-input'

/**
 * SpeechInput uses the Web Speech API or MediaRecorder API for voice capture.
 * In Storybook, clicking the button will prompt for microphone access.
 * The component automatically detects the best available API for the current browser.
 */
const meta = {
  title: 'AI/SpeechInput',
  component: SpeechInput,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Voice input button that uses the Web Speech API (Chrome/Edge) or MediaRecorder fallback (Firefox/Safari). Clicking prompts for microphone permission.',
      },
    },
  },
} satisfies Meta<typeof SpeechInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    onTranscriptionChange: fn(),
  },
}

export const WithAudioRecorder: Story = {
  args: {
    onTranscriptionChange: fn(),
    onAudioRecorded: async (_blob: Blob) => {
      // Simulate a transcription service call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return 'Simulated transcription result'
    },
  },
}

export const WithCustomLanguage: Story = {
  args: {
    lang: 'es-ES',
    onTranscriptionChange: fn(),
  },
}

export const SmallSize: Story = {
  args: {
    size: 'sm',
    onTranscriptionChange: fn(),
  },
}

export const LargeSize: Story = {
  args: {
    size: 'lg',
    onTranscriptionChange: fn(),
  },
}

export const InContext: Story = {
  args: {
    onTranscriptionChange: fn(),
  },
  render: (args) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        background: 'white',
        width: 300,
      }}
    >
      <input
        placeholder="Type or speak your message..."
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          fontSize: 14,
        }}
      />
      <SpeechInput {...args} />
    </div>
  ),
}
