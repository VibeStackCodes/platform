import type { Meta, StoryObj } from '@storybook/react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Canvas } from './canvas'

const meta = {
  title: 'AI/Canvas',
  component: Canvas,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <div style={{ width: '100vw', height: '70vh' }}>
          <Story />
        </div>
      </ReactFlowProvider>
    ),
  ],
} satisfies Meta<typeof Canvas>

export default meta
type Story = StoryObj<typeof meta>

const defaultNodes = [
  {
    id: '1',
    position: { x: 100, y: 100 },
    data: { label: 'Input Node' },
    type: 'default',
  },
  {
    id: '2',
    position: { x: 350, y: 100 },
    data: { label: 'Process Node' },
    type: 'default',
  },
  {
    id: '3',
    position: { x: 600, y: 100 },
    data: { label: 'Output Node' },
    type: 'default',
  },
]

const defaultEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
]

export const Default: Story = {
  args: {
    nodes: defaultNodes,
    edges: defaultEdges,
  },
}

export const Empty: Story = {
  args: {
    nodes: [],
    edges: [],
  },
}

export const ComplexGraph: Story = {
  args: {
    nodes: [
      { id: '1', position: { x: 50, y: 200 }, data: { label: 'User Input' } },
      { id: '2', position: { x: 250, y: 100 }, data: { label: 'Validator' } },
      { id: '3', position: { x: 250, y: 300 }, data: { label: 'Sanitizer' } },
      { id: '4', position: { x: 500, y: 200 }, data: { label: 'Processor' } },
      { id: '5', position: { x: 700, y: 100 }, data: { label: 'Database' } },
      { id: '6', position: { x: 700, y: 300 }, data: { label: 'Cache' } },
      { id: '7', position: { x: 900, y: 200 }, data: { label: 'Response' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e1-3', source: '1', target: '3' },
      { id: 'e2-4', source: '2', target: '4' },
      { id: 'e3-4', source: '3', target: '4' },
      { id: 'e4-5', source: '4', target: '5' },
      { id: 'e4-6', source: '4', target: '6' },
      { id: 'e5-7', source: '5', target: '7' },
      { id: 'e6-7', source: '6', target: '7' },
    ],
  },
}
