import type { Meta, StoryObj } from '@storybook/react'
import { ScriptBlock } from './script-block'

const meta = {
  title: 'AI/ScriptBlock',
  component: ScriptBlock,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ScriptBlock>

export default meta
type Story = StoryObj<typeof meta>

export const CommandOnly: Story = {
  args: {
    command: 'bun run build',
  },
}

export const WithOutput: Story = {
  args: {
    command: 'bun install react-router-dom',
    output:
      'bun add v1.1.29 (b0052301)\n\ninstalled react-router-dom@7.1.5 with 3 packages\n\n 3 packages installed [841.00ms]',
  },
}

export const BuildWithErrors: Story = {
  args: {
    command: 'bun run build',
    output: `src/pages/Dashboard.tsx:12:7 - error TS2304: Cannot find name 'useFetch'.

12       const data = useFetch('/api/projects')
               ~~~~~~~

src/components/Card.tsx:5:18 - error TS7006: Parameter 'props' implicitly has an 'any' type.

5   export function Card(props) {
                         ~~~~~

Found 2 errors. Watching for file changes.`,
  },
}

export const MultiLineCommand: Story = {
  args: {
    command: `bun add \\
  @tanstack/react-query \\
  @tanstack/react-router \\
  zod`,
    commandLabel: 'Install dependencies',
  },
}
