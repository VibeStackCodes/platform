import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { JSXPreview, JSXPreviewContent, JSXPreviewError } from './jsx-preview'

const meta = {
  title: 'AI/JSXPreview',
  component: JSXPreview,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    jsx: '',
  },
} satisfies Meta<typeof JSXPreview>

export default meta
type Story = StoryObj<typeof meta>

export const SimpleElement: Story = {
  args: {
    jsx: "<div style={{padding: '16px', background: '#f0f0f0', borderRadius: '8px'}}><h2>Hello from JSX Preview</h2><p>This is rendered from a JSX string.</p></div>",
  },
  render: (args) => (
    <JSXPreview {...args}>
      <JSXPreviewContent />
      <JSXPreviewError />
    </JSXPreview>
  ),
}

export const WithButton: Story = {
  args: {
    jsx: "<div style={{display:'flex', gap:'8px'}}><button style={{padding:'8px 16px', background:'#3b82f6', color:'white', border:'none', borderRadius:'6px', cursor:'pointer'}}>Primary</button><button style={{padding:'8px 16px', background:'#e5e7eb', border:'none', borderRadius:'6px', cursor:'pointer'}}>Secondary</button></div>",
  },
  render: (args) => (
    <JSXPreview {...args}>
      <JSXPreviewContent />
      <JSXPreviewError />
    </JSXPreview>
  ),
}

export const Streaming: Story = {
  name: 'Streaming (incomplete JSX)',
  args: {
    // Missing closing </div> — JSXPreview completes incomplete tags automatically
    jsx: "<div style={{padding:'16px'}}><h2>Streaming content</h2><p>This paragraph is still be",
    isStreaming: true,
  },
  render: (args) => (
    <JSXPreview {...args}>
      <JSXPreviewContent />
      <JSXPreviewError />
    </JSXPreview>
  ),
}

export const WithError: Story = {
  args: {
    jsx: '<InvalidTag>This tag does not exist and will cause an error</InvalidTag>',
    onError: fn(),
  },
  render: (args) => (
    <JSXPreview {...args}>
      <JSXPreviewContent />
      <JSXPreviewError />
    </JSXPreview>
  ),
}

export const WithBindings: Story = {
  args: {
    jsx: '<div><p>Hello, {name}!</p><p>Count: {count}</p></div>',
    bindings: { name: 'World', count: 42 },
  },
  render: (args) => (
    <JSXPreview {...args}>
      <JSXPreviewContent />
      <JSXPreviewError />
    </JSXPreview>
  ),
}
