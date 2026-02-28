import type { Meta, StoryObj } from '@storybook/react'
import { Background, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Connection } from './connection'

/**
 * Connection is a ConnectionLineComponent for ReactFlow. It renders when the
 * user drags a new connection between nodes. This story demonstrates it inside
 * a live ReactFlow canvas where connections can be initiated by dragging from a handle.
 */
const meta = {
  title: 'AI/Connection',
  component: ReactFlow,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Connection is a custom ReactFlow ConnectionLineComponent. Drag from a node handle to see it in action.',
      },
    },
  },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <div style={{ width: '100vw', height: '50vh' }}>
          <Story />
        </div>
      </ReactFlowProvider>
    ),
  ],
} satisfies Meta<typeof ReactFlow>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    nodes: [
      { id: '1', position: { x: 100, y: 150 }, data: { label: 'Drag from here' } },
      { id: '2', position: { x: 450, y: 150 }, data: { label: 'Connect to here' } },
    ],
    edges: [],
    connectionLineComponent: Connection,
    fitView: true,
  },
  render: (args) => (
    <ReactFlow {...args}>
      <Background />
    </ReactFlow>
  ),
}

export const WithExistingConnections: Story = {
  args: {
    nodes: [
      { id: '1', position: { x: 50, y: 150 }, data: { label: 'Start' } },
      { id: '2', position: { x: 300, y: 150 }, data: { label: 'Middle' } },
      { id: '3', position: { x: 550, y: 150 }, data: { label: 'End' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
    ],
    connectionLineComponent: Connection,
    fitView: true,
  },
  render: (args) => (
    <ReactFlow {...args}>
      <Background />
    </ReactFlow>
  ),
}
