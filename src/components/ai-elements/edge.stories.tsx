import type { Meta, StoryObj } from '@storybook/react'
import { Background, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Edge } from './edge'

/**
 * Edge components require a running ReactFlow canvas to render properly since they
 * rely on internal node positioning from ReactFlow's store.
 * These stories demonstrate each edge type within a minimal ReactFlow setup.
 */
const meta = {
  title: 'AI/Edge',
  component: ReactFlow,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
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

const baseNodes = [
  {
    id: 'a',
    position: { x: 100, y: 150 },
    data: { label: 'Source' },
  },
  {
    id: 'b',
    position: { x: 500, y: 150 },
    data: { label: 'Target' },
  },
]

export const AnimatedEdge: Story = {
  args: {
    nodes: baseNodes,
    edges: [
      {
        id: 'e-animated',
        source: 'a',
        target: 'b',
        type: 'animated',
      },
    ],
    edgeTypes: {
      animated: Edge.Animated,
    },
    fitView: true,
  },
  render: (args) => (
    <ReactFlow {...args}>
      <Background />
    </ReactFlow>
  ),
}

export const TemporaryEdge: Story = {
  args: {
    nodes: baseNodes,
    edges: [
      {
        id: 'e-temporary',
        source: 'a',
        target: 'b',
        type: 'temporary',
      },
    ],
    edgeTypes: {
      temporary: Edge.Temporary,
    },
    fitView: true,
  },
  render: (args) => (
    <ReactFlow {...args}>
      <Background />
    </ReactFlow>
  ),
}

export const BothEdgeTypes: Story = {
  args: {
    nodes: [
      { id: '1', position: { x: 50, y: 80 }, data: { label: 'Node 1' } },
      { id: '2', position: { x: 300, y: 80 }, data: { label: 'Node 2' } },
      { id: '3', position: { x: 50, y: 250 }, data: { label: 'Node 3' } },
      { id: '4', position: { x: 300, y: 250 }, data: { label: 'Node 4' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'animated' },
      { id: 'e3-4', source: '3', target: '4', type: 'temporary' },
    ],
    edgeTypes: {
      animated: Edge.Animated,
      temporary: Edge.Temporary,
    },
    fitView: true,
  },
  render: (args) => (
    <ReactFlow {...args}>
      <Background />
    </ReactFlow>
  ),
}
