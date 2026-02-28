import type { Meta, StoryObj } from '@storybook/react'
import {
  Sandbox,
  SandboxHeader,
  SandboxContent,
  SandboxTabs,
  SandboxTabsBar,
  SandboxTabsList,
  SandboxTabsTrigger,
  SandboxTabContent,
} from './sandbox'

const meta = {
  title: 'AI/Sandbox',
  component: Sandbox,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Sandbox>

export default meta
type Story = StoryObj<typeof meta>

export const Running: Story = {
  render: () => (
    <Sandbox className="w-full max-w-xl">
      <SandboxHeader title="createSandbox" state="input-available" />
      <SandboxContent>
        <SandboxTabs defaultValue="output">
          <SandboxTabsBar>
            <SandboxTabsList>
              <SandboxTabsTrigger value="output">Output</SandboxTabsTrigger>
              <SandboxTabsTrigger value="logs">Logs</SandboxTabsTrigger>
            </SandboxTabsList>
          </SandboxTabsBar>
          <SandboxTabContent value="output">
            <div className="p-4 text-sm text-muted-foreground">
              Initializing sandbox environment...
            </div>
          </SandboxTabContent>
          <SandboxTabContent value="logs">
            <div className="p-4 font-mono text-xs text-muted-foreground">
              [00:00.000] Starting container
            </div>
          </SandboxTabContent>
        </SandboxTabs>
      </SandboxContent>
    </Sandbox>
  ),
}

export const Complete: Story = {
  render: () => (
    <Sandbox className="w-full max-w-xl">
      <SandboxHeader title="createSandbox" state="output-available" />
      <SandboxContent>
        <SandboxTabs defaultValue="output">
          <SandboxTabsBar>
            <SandboxTabsList>
              <SandboxTabsTrigger value="output">Output</SandboxTabsTrigger>
              <SandboxTabsTrigger value="logs">Logs</SandboxTabsTrigger>
            </SandboxTabsList>
          </SandboxTabsBar>
          <SandboxTabContent value="output">
            <div className="p-4 text-sm text-green-600">
              Sandbox ready. Preview URL: https://abc123.daytona.app
            </div>
          </SandboxTabContent>
          <SandboxTabContent value="logs">
            <div className="p-4 font-mono text-xs text-muted-foreground whitespace-pre">
              {`[00:00.000] Starting container\n[00:01.200] Installing dependencies\n[00:03.100] Sandbox ready`}
            </div>
          </SandboxTabContent>
        </SandboxTabs>
      </SandboxContent>
    </Sandbox>
  ),
}

export const Error: Story = {
  render: () => (
    <Sandbox className="w-full max-w-xl">
      <SandboxHeader title="createSandbox" state="output-error" />
      <SandboxContent>
        <SandboxTabs defaultValue="logs">
          <SandboxTabsBar>
            <SandboxTabsList>
              <SandboxTabsTrigger value="logs">Logs</SandboxTabsTrigger>
            </SandboxTabsList>
          </SandboxTabsBar>
          <SandboxTabContent value="logs">
            <div className="p-4 font-mono text-xs text-destructive whitespace-pre">
              {`[00:00.000] Starting container\n[00:00.800] Error: snapshot not found\n[00:00.801] Container exited with code 1`}
            </div>
          </SandboxTabContent>
        </SandboxTabs>
      </SandboxContent>
    </Sandbox>
  ),
}

export const AwaitingApproval: Story = {
  render: () => (
    <Sandbox className="w-full max-w-xl">
      <SandboxHeader title="runCommand" state="approval-requested" />
      <SandboxContent>
        <div className="p-4 text-sm text-muted-foreground">
          Waiting for user approval to execute: <code>rm -rf node_modules</code>
        </div>
      </SandboxContent>
    </Sandbox>
  ),
}

export const Streaming: Story = {
  render: () => (
    <Sandbox className="w-full max-w-xl">
      <SandboxHeader title="runBuild" state="input-streaming" />
      <SandboxContent>
        <div className="p-4 font-mono text-xs text-muted-foreground whitespace-pre">
          vite build...
        </div>
      </SandboxContent>
    </Sandbox>
  ),
}
