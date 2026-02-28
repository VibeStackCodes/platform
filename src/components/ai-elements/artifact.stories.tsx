import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { DownloadIcon, ExternalLinkIcon, ShareIcon } from 'lucide-react'
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from './artifact'

const meta = {
  title: 'AI/Artifact',
  component: Artifact,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Artifact>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Artifact style={{ height: 400 }}>
      <ArtifactHeader>
        <div>
          <ArtifactTitle>Todo Application</ArtifactTitle>
          <ArtifactDescription>React 19 + Supabase + Tailwind CSS</ArtifactDescription>
        </div>
        <ArtifactActions>
          <ArtifactAction tooltip="Share" icon={ShareIcon} onClick={fn()} />
          <ArtifactAction tooltip="Open in new tab" icon={ExternalLinkIcon} onClick={fn()} />
          <ArtifactAction tooltip="Download" icon={DownloadIcon} onClick={fn()} />
          <ArtifactClose onClick={fn()} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent>
        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
          App preview would render here
        </div>
      </ArtifactContent>
    </Artifact>
  ),
}

export const WithCode: Story = {
  render: () => (
    <Artifact style={{ height: 500 }}>
      <ArtifactHeader>
        <div>
          <ArtifactTitle>src/components/todo-list.tsx</ArtifactTitle>
          <ArtifactDescription>Generated component</ArtifactDescription>
        </div>
        <ArtifactActions>
          <ArtifactAction tooltip="Download" icon={DownloadIcon} onClick={fn()} />
          <ArtifactClose onClick={fn()} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="p-0">
        <pre className="h-full overflow-auto bg-muted/30 p-4 font-mono text-sm">
          {`export function TodoList() {
  return (
    <div className="space-y-2">
      <h1>My Todos</h1>
    </div>
  )
}`}
        </pre>
      </ArtifactContent>
    </Artifact>
  ),
}

export const Minimal: Story = {
  render: () => (
    <Artifact style={{ height: 300 }}>
      <ArtifactHeader>
        <ArtifactTitle>Output</ArtifactTitle>
        <ArtifactClose onClick={fn()} />
      </ArtifactHeader>
      <ArtifactContent>
        <p className="text-sm text-muted-foreground">Content goes here.</p>
      </ArtifactContent>
    </Artifact>
  ),
}
