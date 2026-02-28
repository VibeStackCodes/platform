import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { FileTree, FileTreeFile, FileTreeFolder } from './file-tree'
import { sampleFileTree, defaultExpanded, type FileNode, type FolderNode } from './file-tree.fixtures'

const meta = {
  title: 'AI/FileTree',
  component: FileTree,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FileTree>

export default meta
type Story = StoryObj<typeof meta>

function renderTree(nodes: Array<FileNode | FolderNode>) {
  return nodes.map((node) => {
    if (node.type === 'folder') {
      return (
        <FileTreeFolder key={node.path} name={node.name} path={node.path}>
          {renderTree(node.children)}
        </FileTreeFolder>
      )
    }
    return <FileTreeFile key={node.path} name={node.name} path={node.path} />
  })
}

export const Default: Story = {
  render: () => (
    <FileTree defaultExpanded={defaultExpanded} onSelect={fn()}>
      {renderTree(sampleFileTree)}
    </FileTree>
  ),
}

export const AllCollapsed: Story = {
  render: () => (
    <FileTree onSelect={fn()}>
      {renderTree(sampleFileTree)}
    </FileTree>
  ),
}

export const WithSelectedFile: Story = {
  render: () => (
    <FileTree
      defaultExpanded={new Set(['src', 'src/components', 'src/components/ui'])}
      selectedPath="src/components/ui/button.tsx"
      onSelect={fn()}
    >
      {renderTree(sampleFileTree)}
    </FileTree>
  ),
}

export const Flat: Story = {
  render: () => (
    <FileTree onSelect={fn()}>
      <FileTreeFile name="index.ts" path="index.ts" />
      <FileTreeFile name="types.ts" path="types.ts" />
      <FileTreeFile name="utils.ts" path="utils.ts" />
      <FileTreeFile name="config.ts" path="config.ts" />
      <FileTreeFile name="README.md" path="README.md" />
    </FileTree>
  ),
}
