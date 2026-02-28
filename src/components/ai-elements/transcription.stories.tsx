import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Transcription, TranscriptionSegment } from './transcription'

const meta = {
  title: 'AI/Transcription',
  component: Transcription,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Transcription>

export default meta
type Story = StoryObj<typeof meta>

const segments = [
  { text: 'Hello,', startSecond: 0, endSecond: 0.5 },
  { text: 'my', startSecond: 0.5, endSecond: 0.8 },
  { text: 'name', startSecond: 0.8, endSecond: 1.1 },
  { text: 'is', startSecond: 1.1, endSecond: 1.3 },
  { text: 'Claude.', startSecond: 1.3, endSecond: 1.8 },
  { text: "I'm", startSecond: 1.8, endSecond: 2.1 },
  { text: 'an', startSecond: 2.1, endSecond: 2.3 },
  { text: 'AI', startSecond: 2.3, endSecond: 2.6 },
  { text: 'assistant', startSecond: 2.6, endSecond: 3.1 },
  { text: 'made', startSecond: 3.1, endSecond: 3.4 },
  { text: 'by', startSecond: 3.4, endSecond: 3.6 },
  { text: 'Anthropic.', startSecond: 3.6, endSecond: 4.2 },
  { text: 'How', startSecond: 4.2, endSecond: 4.5 },
  { text: 'can', startSecond: 4.5, endSecond: 4.7 },
  { text: 'I', startSecond: 4.7, endSecond: 4.9 },
  { text: 'help', startSecond: 4.9, endSecond: 5.2 },
  { text: 'you', startSecond: 5.2, endSecond: 5.4 },
  { text: 'today?', startSecond: 5.4, endSecond: 6.0 },
]

export const AtStart: Story = {
  args: {
    segments,
    currentTime: 0,
    onSeek: fn(),
    children: (segment, index) => (
      <TranscriptionSegment key={index} segment={segment} index={index} />
    ),
  },
}

export const MidPlayback: Story = {
  args: {
    segments,
    currentTime: 2.5,
    onSeek: fn(),
    children: (segment, index) => (
      <TranscriptionSegment key={index} segment={segment} index={index} />
    ),
  },
}

export const AtEnd: Story = {
  args: {
    segments,
    currentTime: 6.5,
    onSeek: fn(),
    children: (segment, index) => (
      <TranscriptionSegment key={index} segment={segment} index={index} />
    ),
  },
}

export const NonSeekable: Story = {
  args: {
    segments,
    currentTime: 3.0,
    children: (segment, index) => (
      <TranscriptionSegment key={index} segment={segment} index={index} />
    ),
  },
}

export const LongTranscription: Story = {
  args: {
    segments: [
      { text: 'In', startSecond: 0, endSecond: 0.3 },
      { text: 'this', startSecond: 0.3, endSecond: 0.5 },
      { text: 'tutorial,', startSecond: 0.5, endSecond: 1.0 },
      { text: "we'll", startSecond: 1.0, endSecond: 1.3 },
      { text: 'learn', startSecond: 1.3, endSecond: 1.6 },
      { text: 'how', startSecond: 1.6, endSecond: 1.8 },
      { text: 'to', startSecond: 1.8, endSecond: 1.9 },
      { text: 'build', startSecond: 1.9, endSecond: 2.2 },
      { text: 'a', startSecond: 2.2, endSecond: 2.3 },
      { text: 'production-ready', startSecond: 2.3, endSecond: 3.0 },
      { text: 'React', startSecond: 3.0, endSecond: 3.3 },
      { text: 'application', startSecond: 3.3, endSecond: 3.9 },
      { text: 'from', startSecond: 3.9, endSecond: 4.1 },
      { text: 'scratch,', startSecond: 4.1, endSecond: 4.6 },
      { text: 'covering', startSecond: 4.6, endSecond: 5.0 },
      { text: 'authentication,', startSecond: 5.0, endSecond: 5.8 },
      { text: 'database', startSecond: 5.8, endSecond: 6.2 },
      { text: 'design,', startSecond: 6.2, endSecond: 6.7 },
      { text: 'and', startSecond: 6.7, endSecond: 6.9 },
      { text: 'deployment.', startSecond: 6.9, endSecond: 7.5 },
    ],
    currentTime: 3.5,
    onSeek: fn(),
    children: (segment, index) => (
      <TranscriptionSegment key={index} segment={segment} index={index} />
    ),
  },
}
