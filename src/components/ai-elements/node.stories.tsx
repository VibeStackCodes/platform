import type { Meta, StoryObj } from '@storybook/react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Node,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from './node'

const meta = {
  title: 'AI/Node',
  component: Node,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <Story />
      </ReactFlowProvider>
    ),
  ],
} satisfies Meta<typeof Node>

export default meta
type Story = StoryObj<typeof meta>

export const BothHandles: Story = {
  args: {
    handles: { target: true, source: true },
  },
  render: (args) => (
    <Node {...args}>
      <NodeHeader>
        <NodeTitle>Data Processor</NodeTitle>
        <NodeDescription>Transforms input data</NodeDescription>
      </NodeHeader>
      <NodeContent>
        <p style={{ fontSize: 12, color: '#6b7280' }}>Processing pipeline node</p>
      </NodeContent>
    </Node>
  ),
}

export const SourceOnly: Story = {
  args: {
    handles: { target: false, source: true },
  },
  render: (args) => (
    <Node {...args}>
      <NodeHeader>
        <NodeTitle>User Input</NodeTitle>
        <NodeDescription>Entry point</NodeDescription>
      </NodeHeader>
      <NodeContent>
        <p style={{ fontSize: 12, color: '#6b7280' }}>Triggers the pipeline</p>
      </NodeContent>
    </Node>
  ),
}

export const TargetOnly: Story = {
  args: {
    handles: { target: true, source: false },
  },
  render: (args) => (
    <Node {...args}>
      <NodeHeader>
        <NodeTitle>Output</NodeTitle>
        <NodeDescription>Final result</NodeDescription>
      </NodeHeader>
      <NodeContent>
        <p style={{ fontSize: 12, color: '#6b7280' }}>Collects pipeline results</p>
      </NodeContent>
      <NodeFooter>
        <span style={{ fontSize: 11 }}>Ready</span>
      </NodeFooter>
    </Node>
  ),
}

export const NoHandles: Story = {
  args: {
    handles: { target: false, source: false },
  },
  render: (args) => (
    <Node {...args}>
      <NodeHeader>
        <NodeTitle>Standalone Node</NodeTitle>
      </NodeHeader>
      <NodeContent>
        <p style={{ fontSize: 12, color: '#6b7280' }}>No connections</p>
      </NodeContent>
    </Node>
  ),
}

export const WithFooter: Story = {
  args: {
    handles: { target: true, source: true },
  },
  render: (args) => (
    <Node {...args}>
      <NodeHeader>
        <NodeTitle>LLM Call</NodeTitle>
        <NodeDescription>claude-opus-4-6</NodeDescription>
      </NodeHeader>
      <NodeContent>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          <div>Temperature: 0.7</div>
          <div>Max tokens: 4096</div>
        </div>
      </NodeContent>
      <NodeFooter>
        <span style={{ fontSize: 11, color: '#10b981' }}>Completed in 1.2s</span>
      </NodeFooter>
    </Node>
  ),
}
