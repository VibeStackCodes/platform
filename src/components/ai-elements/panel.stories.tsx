import type { Meta, StoryObj } from '@storybook/react'
import { Background, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Panel } from './panel'

const meta = {
  title: 'AI/Panel',
  component: Panel,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <div style={{ width: '100vw', height: '60vh' }}>
          <ReactFlow nodes={[]} edges={[]} fitView>
            <Background />
            <Story />
          </ReactFlow>
        </div>
      </ReactFlowProvider>
    ),
  ],
} satisfies Meta<typeof Panel>

export default meta
type Story = StoryObj<typeof meta>

export const TopLeft: Story = {
  args: {
    position: 'top-left',
    children: (
      <div className="flex gap-2 p-1">
        <button
          type="button"
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #e2e8f0',
            background: 'white',
          }}
        >
          Zoom In
        </button>
        <button
          type="button"
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #e2e8f0',
            background: 'white',
          }}
        >
          Zoom Out
        </button>
      </div>
    ),
  },
}

export const TopRight: Story = {
  args: {
    position: 'top-right',
    children: (
      <div style={{ padding: '4px 8px', fontSize: 12 }}>
        Pipeline Controls
      </div>
    ),
  },
}

export const BottomCenter: Story = {
  args: {
    position: 'bottom-center',
    children: (
      <div style={{ padding: '4px 8px', fontSize: 12 }}>
        2 nodes selected
      </div>
    ),
  },
}
