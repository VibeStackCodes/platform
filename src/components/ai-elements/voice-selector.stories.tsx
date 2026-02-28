import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Button } from '@/components/ui/button'
import {
  VoiceSelector,
  VoiceSelectorAccent,
  VoiceSelectorAge,
  VoiceSelectorAttributes,
  VoiceSelectorBullet,
  VoiceSelectorContent,
  VoiceSelectorDescription,
  VoiceSelectorEmpty,
  VoiceSelectorGender,
  VoiceSelectorGroup,
  VoiceSelectorInput,
  VoiceSelectorItem,
  VoiceSelectorList,
  VoiceSelectorName,
  VoiceSelectorPreview,
  VoiceSelectorSeparator,
  VoiceSelectorTrigger,
} from './voice-selector'

const meta = {
  title: 'AI/VoiceSelector',
  component: VoiceSelector,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof VoiceSelector>

export default meta
type Story = StoryObj<typeof meta>

const voices = [
  { id: 'alloy', name: 'Alloy', gender: 'female' as const, accent: 'american' as const, age: '28', description: 'Warm and natural' },
  { id: 'echo', name: 'Echo', gender: 'male' as const, accent: 'british' as const, age: '35', description: 'Clear and precise' },
  { id: 'fable', name: 'Fable', gender: 'non-binary' as const, accent: 'australian' as const, age: '30', description: 'Storytelling quality' },
  { id: 'onyx', name: 'Onyx', gender: 'male' as const, accent: 'american' as const, age: '42', description: 'Deep and authoritative' },
  { id: 'nova', name: 'Nova', gender: 'female' as const, accent: 'american' as const, age: '25', description: 'Bright and energetic' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female' as const, accent: 'canadian' as const, age: '32', description: 'Smooth and professional' },
]

export const Default: Story = {
  args: {
    onValueChange: fn(),
  },
  render: (args) => (
    <VoiceSelector {...args}>
      <VoiceSelectorTrigger asChild>
        <Button variant="outline">Select Voice</Button>
      </VoiceSelectorTrigger>
      <VoiceSelectorContent>
        <VoiceSelectorInput placeholder="Search voices..." />
        <VoiceSelectorList>
          <VoiceSelectorGroup heading="Standard">
            {voices.map((voice) => (
              <VoiceSelectorItem key={voice.id} value={voice.id}>
                <VoiceSelectorName>{voice.name}</VoiceSelectorName>
                <VoiceSelectorAttributes>
                  <VoiceSelectorGender value={voice.gender} />
                  <VoiceSelectorBullet />
                  <VoiceSelectorAccent value={voice.accent} />
                  <VoiceSelectorBullet />
                  <VoiceSelectorAge>{voice.age}</VoiceSelectorAge>
                </VoiceSelectorAttributes>
              </VoiceSelectorItem>
            ))}
          </VoiceSelectorGroup>
        </VoiceSelectorList>
      </VoiceSelectorContent>
    </VoiceSelector>
  ),
}

export const WithDescriptions: Story = {
  args: {
    defaultValue: 'alloy',
    onValueChange: fn(),
  },
  render: (args) => (
    <VoiceSelector {...args}>
      <VoiceSelectorTrigger asChild>
        <Button variant="outline">Select Voice</Button>
      </VoiceSelectorTrigger>
      <VoiceSelectorContent>
        <VoiceSelectorInput />
        <VoiceSelectorList>
          <VoiceSelectorGroup heading="AI Voices">
            {voices.slice(0, 3).map((voice) => (
              <VoiceSelectorItem key={voice.id} value={voice.id}>
                <VoiceSelectorName>{voice.name}</VoiceSelectorName>
                <VoiceSelectorDescription>{voice.description}</VoiceSelectorDescription>
              </VoiceSelectorItem>
            ))}
            <VoiceSelectorSeparator />
            {voices.slice(3).map((voice) => (
              <VoiceSelectorItem key={voice.id} value={voice.id}>
                <VoiceSelectorName>{voice.name}</VoiceSelectorName>
                <VoiceSelectorDescription>{voice.description}</VoiceSelectorDescription>
              </VoiceSelectorItem>
            ))}
          </VoiceSelectorGroup>
        </VoiceSelectorList>
      </VoiceSelectorContent>
    </VoiceSelector>
  ),
}

export const WithPreview: Story = {
  args: {
    onValueChange: fn(),
  },
  render: (args) => (
    <VoiceSelector {...args}>
      <VoiceSelectorTrigger asChild>
        <Button variant="outline">Select Voice</Button>
      </VoiceSelectorTrigger>
      <VoiceSelectorContent>
        <VoiceSelectorInput />
        <VoiceSelectorList>
          <VoiceSelectorEmpty>No voices found</VoiceSelectorEmpty>
          <VoiceSelectorGroup>
            {voices.slice(0, 4).map((voice) => (
              <VoiceSelectorItem key={voice.id} value={voice.id}>
                <VoiceSelectorPreview onPlay={fn()} />
                <VoiceSelectorName>{voice.name}</VoiceSelectorName>
                <VoiceSelectorAttributes>
                  <VoiceSelectorGender value={voice.gender} />
                  <VoiceSelectorBullet />
                  <VoiceSelectorAccent value={voice.accent} />
                </VoiceSelectorAttributes>
              </VoiceSelectorItem>
            ))}
          </VoiceSelectorGroup>
        </VoiceSelectorList>
      </VoiceSelectorContent>
    </VoiceSelector>
  ),
}

export const WithPlayingState: Story = {
  args: {
    onValueChange: fn(),
  },
  render: (args) => (
    <VoiceSelector {...args}>
      <VoiceSelectorTrigger asChild>
        <Button variant="outline">Select Voice</Button>
      </VoiceSelectorTrigger>
      <VoiceSelectorContent>
        <VoiceSelectorInput />
        <VoiceSelectorList>
          <VoiceSelectorGroup>
            <VoiceSelectorItem value="alloy">
              <VoiceSelectorPreview playing onPlay={fn()} />
              <VoiceSelectorName>Alloy (playing)</VoiceSelectorName>
            </VoiceSelectorItem>
            <VoiceSelectorItem value="echo">
              <VoiceSelectorPreview loading />
              <VoiceSelectorName>Echo (loading)</VoiceSelectorName>
            </VoiceSelectorItem>
            <VoiceSelectorItem value="fable">
              <VoiceSelectorPreview onPlay={fn()} />
              <VoiceSelectorName>Fable (idle)</VoiceSelectorName>
            </VoiceSelectorItem>
          </VoiceSelectorGroup>
        </VoiceSelectorList>
      </VoiceSelectorContent>
    </VoiceSelector>
  ),
}
