/**
 * Controls wraps @xyflow/react's `<Controls>` primitive.
 * It requires a ReactFlow `<ReactFlowProvider>` and a `<ReactFlow>` canvas in the
 * render tree to function — the Controls component reads zoom/pan state from
 * the ReactFlow context via the @xyflow/react store.
 *
 * Without that context the component throws at runtime, so we render it inside
 * a minimal ReactFlow canvas below.
 */
import type { Meta, StoryObj } from '@storybook/react'
import { ReactFlow, ReactFlowProvider, Background } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Controls } from './controls'

const meta = {
  title: 'AI/Controls',
  component: Controls,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <Story />
      </ReactFlowProvider>
    ),
  ],
} satisfies Meta<typeof Controls>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div style={{ width: '100%', height: 300 }}>
      <ReactFlow nodes={[]} edges={[]}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  ),
}

export const HideZoomAndFit: Story = {
  name: 'Without Fit View',
  render: () => (
    <div style={{ width: '100%', height: 300 }}>
      <ReactFlow nodes={[]} edges={[]}>
        <Background />
        <Controls showFitView={false} />
      </ReactFlow>
    </div>
  ),
}

export const HideInteractive: Story = {
  name: 'Without Interactive Toggle',
  render: () => (
    <div style={{ width: '100%', height: 300 }}>
      <ReactFlow nodes={[]} edges={[]}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  ),
}
