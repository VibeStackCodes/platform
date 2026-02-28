import type { Meta, StoryObj } from '@storybook/react'
import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from './task'

const meta = {
  title: 'AI/Task',
  component: Task,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Task>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Task defaultOpen>
      <TaskTrigger title="Searching for relevant files" />
      <TaskContent>
        <TaskItem>Found 3 matching components</TaskItem>
        <TaskItem>
          Analyzing <TaskItemFile>src/components/Button.tsx</TaskItemFile>
        </TaskItem>
        <TaskItem>
          Reviewing <TaskItemFile>src/components/Input.tsx</TaskItemFile>
        </TaskItem>
      </TaskContent>
    </Task>
  ),
}

export const Collapsed: Story = {
  render: () => (
    <Task defaultOpen={false}>
      <TaskTrigger title="Reading project files" />
      <TaskContent>
        <TaskItem>Loaded package.json</TaskItem>
        <TaskItem>Loaded tsconfig.json</TaskItem>
        <TaskItem>Loaded vite.config.ts</TaskItem>
      </TaskContent>
    </Task>
  ),
}

export const MultipleFiles: Story = {
  render: () => (
    <Task defaultOpen>
      <TaskTrigger title="Reviewing component implementations" />
      <TaskContent>
        <TaskItem>
          Checking <TaskItemFile>Dashboard.tsx</TaskItemFile> for state management patterns
        </TaskItem>
        <TaskItem>
          Reading <TaskItemFile>api/users.ts</TaskItemFile> for endpoint signatures
        </TaskItem>
        <TaskItem>
          Reviewing <TaskItemFile>types/index.ts</TaskItemFile> for type definitions
        </TaskItem>
        <TaskItem>
          Examining <TaskItemFile>hooks/useAuth.ts</TaskItemFile> for authentication flow
        </TaskItem>
      </TaskContent>
    </Task>
  ),
}

export const Multiple: Story = {
  render: () => (
    <div className="space-y-2">
      <Task defaultOpen>
        <TaskTrigger title="Planning architecture" />
        <TaskContent>
          <TaskItem>Identified 5 core features</TaskItem>
          <TaskItem>Selected tech stack: React 19, Hono, Drizzle</TaskItem>
        </TaskContent>
      </Task>
      <Task defaultOpen>
        <TaskTrigger title="Generating components" />
        <TaskContent>
          <TaskItem>
            Created <TaskItemFile>Layout.tsx</TaskItemFile>
          </TaskItem>
          <TaskItem>
            Created <TaskItemFile>Dashboard.tsx</TaskItemFile>
          </TaskItem>
        </TaskContent>
      </Task>
      <Task defaultOpen={false}>
        <TaskTrigger title="Running build checks" />
        <TaskContent>
          <TaskItem>TypeScript compilation: passing</TaskItem>
          <TaskItem>Vite build: success</TaskItem>
        </TaskContent>
      </Task>
    </div>
  ),
}
