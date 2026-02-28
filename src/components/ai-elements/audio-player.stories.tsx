import type { Meta, StoryObj } from '@storybook/react'
import {
  AudioPlayer,
  AudioPlayerControlBar,
  AudioPlayerDurationDisplay,
  AudioPlayerElement,
  AudioPlayerMuteButton,
  AudioPlayerPlayButton,
  AudioPlayerSeekBackwardButton,
  AudioPlayerSeekForwardButton,
  AudioPlayerTimeDisplay,
  AudioPlayerTimeRange,
  AudioPlayerVolumeRange,
} from './audio-player'

const meta = {
  title: 'AI/AudioPlayer',
  component: AudioPlayer,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AudioPlayer>

export default meta
type Story = StoryObj<typeof meta>

// Using a freely available audio sample
const sampleAudioSrc = 'https://www.w3schools.com/html/horse.mp3'

export const FullControls: Story = {
  render: () => (
    <AudioPlayer>
      <AudioPlayerElement src={sampleAudioSrc} />
      <AudioPlayerControlBar>
        <AudioPlayerPlayButton />
        <AudioPlayerSeekBackwardButton />
        <AudioPlayerTimeDisplay />
        <AudioPlayerTimeRange />
        <AudioPlayerDurationDisplay />
        <AudioPlayerSeekForwardButton />
        <AudioPlayerMuteButton />
        <AudioPlayerVolumeRange />
      </AudioPlayerControlBar>
    </AudioPlayer>
  ),
}

export const MinimalControls: Story = {
  render: () => (
    <AudioPlayer>
      <AudioPlayerElement src={sampleAudioSrc} />
      <AudioPlayerControlBar>
        <AudioPlayerPlayButton />
        <AudioPlayerTimeRange />
        <AudioPlayerDurationDisplay />
      </AudioPlayerControlBar>
    </AudioPlayer>
  ),
}

export const PlaybackOnly: Story = {
  render: () => (
    <AudioPlayer>
      <AudioPlayerElement src={sampleAudioSrc} />
      <AudioPlayerControlBar>
        <AudioPlayerSeekBackwardButton seekOffset={5} />
        <AudioPlayerPlayButton />
        <AudioPlayerSeekForwardButton seekOffset={5} />
        <AudioPlayerTimeDisplay />
        <AudioPlayerTimeRange />
        <AudioPlayerDurationDisplay />
      </AudioPlayerControlBar>
    </AudioPlayer>
  ),
}

export const WithVolume: Story = {
  render: () => (
    <AudioPlayer>
      <AudioPlayerElement src={sampleAudioSrc} />
      <AudioPlayerControlBar>
        <AudioPlayerPlayButton />
        <AudioPlayerTimeRange />
        <AudioPlayerMuteButton />
        <AudioPlayerVolumeRange />
      </AudioPlayerControlBar>
    </AudioPlayer>
  ),
}
