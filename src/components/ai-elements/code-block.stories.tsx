import type { Meta, StoryObj } from '@storybook/react'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContainer,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from './code-block'
import { typescriptSample, pythonSample, jsonSample } from './code-block.fixtures'

const meta: Meta = {
  title: 'AI/CodeBlock',
  component: CodeBlock,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

export const TypeScript: Story = {
  args: {
    code: typescriptSample,
    language: 'typescript',
    showLineNumbers: false,
  },
}

export const TypeScriptWithLineNumbers: Story = {
  args: {
    code: typescriptSample,
    language: 'typescript',
    showLineNumbers: true,
  },
}

export const Python: Story = {
  args: {
    code: pythonSample,
    language: 'python',
    showLineNumbers: false,
  },
}

export const JSON: Story = {
  args: {
    code: jsonSample,
    language: 'json',
    showLineNumbers: false,
  },
}

export const WithHeader: Story = {
  render: () => (
    <CodeBlock code={typescriptSample} language="typescript">
      <CodeBlockHeader>
        <CodeBlockTitle>
          <CodeBlockFilename>src/hooks/useUser.ts</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  ),
}

export const ContainerOnly: Story = {
  render: () => (
    <CodeBlockContainer language="json">
      <CodeBlockContent code={jsonSample} language="json" showLineNumbers />
    </CodeBlockContainer>
  ),
}
