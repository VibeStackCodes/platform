import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import {
  MicSelector,
  MicSelectorContent,
  MicSelectorEmpty,
  MicSelectorInput,
  MicSelectorItem,
  MicSelectorLabel,
  MicSelectorList,
  MicSelectorTrigger,
  MicSelectorValue,
} from './mic-selector'

/**
 * MicSelector uses the MediaDevices API internally to enumerate audio devices.
 * In Storybook, the browser will prompt for microphone permission when the dropdown opens.
 * Without permission, the list will show devices with empty labels.
 */
const meta = {
  title: 'AI/MicSelector',
  component: MicSelector,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Microphone device selector using the MediaDevices API. Requires browser microphone permission to show device labels.',
      },
    },
  },
} satisfies Meta<typeof MicSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    onValueChange: fn(),
    onOpenChange: fn(),
  },
  render: (args) => (
    <MicSelector {...args}>
      <MicSelectorTrigger>
        <MicSelectorValue />
      </MicSelectorTrigger>
      <MicSelectorContent>
        <MicSelectorInput />
        <MicSelectorList>
          {(devices) =>
            devices.length === 0 ? (
              <MicSelectorEmpty />
            ) : (
              devices.map((device) => (
                <MicSelectorItem key={device.deviceId} value={device.deviceId}>
                  <MicSelectorLabel device={device} />
                </MicSelectorItem>
              ))
            )
          }
        </MicSelectorList>
      </MicSelectorContent>
    </MicSelector>
  ),
}

export const WithPreselectedValue: Story = {
  args: {
    defaultValue: 'default',
    onValueChange: fn(),
  },
  render: (args) => (
    <MicSelector {...args}>
      <MicSelectorTrigger>
        <MicSelectorValue />
      </MicSelectorTrigger>
      <MicSelectorContent>
        <MicSelectorInput placeholder="Filter microphones..." />
        <MicSelectorList>
          {(devices) =>
            devices.length === 0 ? (
              <MicSelectorEmpty>No microphones found. Please check permissions.</MicSelectorEmpty>
            ) : (
              devices.map((device) => (
                <MicSelectorItem key={device.deviceId} value={device.deviceId}>
                  <MicSelectorLabel device={device} />
                </MicSelectorItem>
              ))
            )
          }
        </MicSelectorList>
      </MicSelectorContent>
    </MicSelector>
  ),
}
