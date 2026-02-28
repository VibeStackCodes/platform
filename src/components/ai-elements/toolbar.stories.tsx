/**
 * Toolbar wraps @xyflow/react's `<NodeToolbar>` primitive.
 * NodeToolbar must be rendered inside a ReactFlow node component with a valid
 * ReactFlow context — it reads the node's position and visibility from the
 * @xyflow/react store.
 *
 * We render it here inside a minimal ReactFlow canvas with a custom node
 * that includes the Toolbar so the story is visually accurate.
 */
import type { Meta, StoryObj } from '@storybook/react'
import type { NodeTypes } from '@xyflow/react'
import { ReactFlow, ReactFlowProvider, Background } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { fn } from '@storybook/test'
import { Toolbar } from './toolbar'
import { Trash2Icon, CopyIcon, EditIcon } from 'lucide-react'

const meta = {
  title: 'AI/Toolbar',
  component: Toolbar,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <Story />
      </ReactFlowProvider>
    ),
  ],
} satisfies Meta<typeof Toolbar>

export default meta
type Story = StoryObj<typeof meta>

// Custom node that renders Toolbar inside itself (required by NodeToolbar)
function DemoNode() {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow text-sm font-medium">
      Hover to see toolbar
      <Toolbar isVisible>
        <button
          type="button"
          onClick={fn()}
          className="rounded p-1 hover:bg-accent"
          title="Edit"
        >
          <EditIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={fn()}
          className="rounded p-1 hover:bg-accent"
          title="Duplicate"
        >
          <CopyIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={fn()}
          className="rounded p-1 hover:bg-destructive/10 text-destructive"
          title="Delete"
        >
          <Trash2Icon className="size-4" />
        </button>
      </Toolbar>
    </div>
  )
}

const nodeTypes: NodeTypes = { demo: DemoNode }

const nodes = [
  {
    id: '1',
    type: 'demo',
    position: { x: 150, y: 100 },
    data: {},
    selected: true,
  },
]

export const Default: Story = {
  render: () => (
    <div style={{ width: '100%', height: 300 }}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
      </ReactFlow>
    </div>
  ),
}

export const AlwaysVisible: Story = {
  name: 'Always Visible (isVisible: true)',
  render: () => (
    <div style={{ width: '100%', height: 300 }}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
      </ReactFlow>
    </div>
  ),
}
