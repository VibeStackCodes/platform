import type { Meta, StoryObj } from '@storybook/react'
import {
  Agent,
  AgentContent,
  AgentHeader,
  AgentInstructions,
  AgentOutput,
  AgentTool,
  AgentTools,
} from './agent'
import { sampleTools, outputSchema } from './agent.fixtures'

const meta = {
  title: 'AI/Agent',
  component: Agent,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Agent>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  render: () => (
    <Agent>
      <AgentHeader name="Orchestrator" model="claude-opus-4-6" />
    </Agent>
  ),
}

export const WithInstructions: Story = {
  render: () => (
    <Agent>
      <AgentHeader name="Code Generator" model="claude-sonnet-4-6" />
      <AgentContent>
        <AgentInstructions>
          You are an expert full-stack developer. Generate production-ready React applications with
          TypeScript, Tailwind CSS, and modern best practices. Always write clean, well-documented
          code with proper error handling.
        </AgentInstructions>
      </AgentContent>
    </Agent>
  ),
}

export const WithTools: Story = {
  render: () => (
    <Agent>
      <AgentHeader name="Orchestrator" model="claude-opus-4-6" />
      <AgentContent>
        <AgentTools type="single">
          {sampleTools.map((tool, i) => (
            <AgentTool key={i} tool={tool} value={`tool-${i}`} />
          ))}
        </AgentTools>
      </AgentContent>
    </Agent>
  ),
}

export const WithOutputSchema: Story = {
  render: () => (
    <Agent>
      <AgentHeader name="Structured Output Agent" model="gpt-5-2-codex" />
      <AgentContent>
        <AgentOutput schema={outputSchema} />
      </AgentContent>
    </Agent>
  ),
}

export const Full: Story = {
  render: () => (
    <Agent>
      <AgentHeader name="VibeStack Orchestrator" model="claude-opus-4-6" />
      <AgentContent>
        <AgentInstructions>
          You are the VibeStack AI orchestrator. Given a user prompt, generate a complete, working
          web application using React 19, Tailwind CSS v4, and shadcn/ui. Use the provided tools to
          create files, run commands, install packages, and verify the build passes.
        </AgentInstructions>
        <AgentTools type="single">
          {sampleTools.map((tool, i) => (
            <AgentTool key={i} tool={tool} value={`tool-${i}`} />
          ))}
        </AgentTools>
        <AgentOutput schema={outputSchema} />
      </AgentContent>
    </Agent>
  ),
}
