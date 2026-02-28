import type { Meta, StoryObj } from '@storybook/react'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from './tool'

const meta = {
  title: 'AI/Tool',
  component: Tool,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Tool>

export default meta
type Story = StoryObj<typeof meta>

export const InputStreaming: Story = {
  render: () => (
    <Tool>
      <ToolHeader type="tool-writeFile" state="input-streaming" />
    </Tool>
  ),
}

export const InputAvailable: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader type="tool-writeFile" state="input-available" />
      <ToolContent>
        <ToolInput
          input={{
            path: 'src/components/Dashboard.tsx',
            content: 'export function Dashboard() { return <div>Dashboard</div> }',
          }}
        />
      </ToolContent>
    </Tool>
  ),
}

export const OutputAvailable: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader type="tool-readFile" state="output-available" />
      <ToolContent>
        <ToolInput input={{ path: 'src/App.tsx' }} />
        <ToolOutput
          output={{ content: 'import React from "react"\nexport default function App() {}' }}
          errorText={undefined}
        />
      </ToolContent>
    </Tool>
  ),
}

export const OutputError: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader type="tool-runBuild" state="output-error" />
      <ToolContent>
        <ToolInput input={{ command: 'bun run build' }} />
        <ToolOutput
          output={undefined}
          errorText="TypeScript error: Property 'foo' does not exist on type 'Bar'. (src/components/Widget.tsx:42)"
        />
      </ToolContent>
    </Tool>
  ),
}

export const ApprovalRequested: Story = {
  render: () => (
    <Tool>
      <ToolHeader
        type="tool-runCommand"
        state="approval-requested"
        title="Run shell command"
      />
    </Tool>
  ),
}

export const DynamicTool: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader
        type="dynamic-tool"
        state="output-available"
        toolName="web-search"
        title="Web Search"
      />
      <ToolContent>
        <ToolInput input={{ query: 'React 19 server components tutorial' }} />
        <ToolOutput
          output={{
            results: [
              { title: 'React Server Components Guide', url: 'https://react.dev/rsc' },
              { title: 'Next.js App Router', url: 'https://nextjs.org/docs/app' },
            ],
          }}
          errorText={undefined}
        />
      </ToolContent>
    </Tool>
  ),
}

export const AllStates: Story = {
  render: () => (
    <div className="space-y-2">
      <Tool>
        <ToolHeader type="tool-writeFile" state="input-streaming" />
      </Tool>
      <Tool>
        <ToolHeader type="tool-writeFile" state="input-available" />
      </Tool>
      <Tool>
        <ToolHeader type="tool-readFile" state="output-available" />
      </Tool>
      <Tool>
        <ToolHeader type="tool-runBuild" state="output-error" />
      </Tool>
      <Tool>
        <ToolHeader type="tool-runCommand" state="approval-requested" />
      </Tool>
      <Tool>
        <ToolHeader type="tool-runCommand" state="output-denied" />
      </Tool>
    </div>
  ),
}
