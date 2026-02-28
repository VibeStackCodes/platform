import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Persona } from './persona'

/**
 * Persona renders animated AI avatar visuals using the Rive WebGL2 runtime.
 * The animations are loaded from remote .riv files. An internet connection is
 * required to see the animations in Storybook.
 */
const meta = {
  title: 'AI/Persona',
  component: Persona,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Animated AI persona visual using Rive WebGL2. Loads .riv animation files from a CDN. Requires an internet connection.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['obsidian', 'command', 'glint', 'halo', 'mana', 'opal'],
    },
    state: {
      control: 'select',
      options: ['idle', 'listening', 'thinking', 'speaking', 'asleep'],
    },
  },
} satisfies Meta<typeof Persona>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  args: {
    state: 'idle',
    variant: 'obsidian',
    onLoad: fn(),
    onReady: fn(),
  },
}

export const Listening: Story = {
  args: {
    state: 'listening',
    variant: 'obsidian',
  },
}

export const Thinking: Story = {
  args: {
    state: 'thinking',
    variant: 'obsidian',
  },
}

export const Speaking: Story = {
  args: {
    state: 'speaking',
    variant: 'obsidian',
  },
}

export const Asleep: Story = {
  args: {
    state: 'asleep',
    variant: 'obsidian',
  },
}

export const CommandVariant: Story = {
  args: {
    state: 'idle',
    variant: 'command',
  },
}

export const GlintVariant: Story = {
  args: {
    state: 'idle',
    variant: 'glint',
  },
}

export const HaloVariant: Story = {
  args: {
    state: 'idle',
    variant: 'halo',
  },
}

export const ManaVariant: Story = {
  args: {
    state: 'idle',
    variant: 'mana',
  },
}

export const OpalVariant: Story = {
  args: {
    state: 'idle',
    variant: 'opal',
  },
}

export const Large: Story = {
  args: {
    state: 'idle',
    variant: 'obsidian',
    className: 'size-32',
  },
}

export const AllVariants: Story = {
  args: {
    state: 'idle',
  },
  render: (args) => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
      {(['obsidian', 'command', 'glint', 'halo', 'mana', 'opal'] as const).map((variant) => (
        <div key={variant} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Persona {...args} variant={variant} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>{variant}</span>
        </div>
      ))}
    </div>
  ),
}

export const AllStates: Story = {
  args: {
    state: 'idle',
    variant: 'obsidian',
  },
  render: (args) => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
      {(['idle', 'listening', 'thinking', 'speaking', 'asleep'] as const).map((state) => (
        <div key={state} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Persona {...args} state={state} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>{state}</span>
        </div>
      ))}
    </div>
  ),
}
