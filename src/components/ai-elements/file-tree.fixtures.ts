export interface FileNode {
  type: 'file'
  name: string
  path: string
}

export interface FolderNode {
  type: 'folder'
  name: string
  path: string
  children: Array<FileNode | FolderNode>
}

export type TreeNode = FileNode | FolderNode

export const sampleFileTree: TreeNode[] = [
  {
    type: 'folder',
    name: 'src',
    path: 'src',
    children: [
      {
        type: 'folder',
        name: 'components',
        path: 'src/components',
        children: [
          {
            type: 'folder',
            name: 'ui',
            path: 'src/components/ui',
            children: [
              { type: 'file', name: 'button.tsx', path: 'src/components/ui/button.tsx' },
              { type: 'file', name: 'card.tsx', path: 'src/components/ui/card.tsx' },
              { type: 'file', name: 'input.tsx', path: 'src/components/ui/input.tsx' },
            ],
          },
          { type: 'file', name: 'header.tsx', path: 'src/components/header.tsx' },
          { type: 'file', name: 'footer.tsx', path: 'src/components/footer.tsx' },
        ],
      },
      {
        type: 'folder',
        name: 'routes',
        path: 'src/routes',
        children: [
          { type: 'file', name: '__root.tsx', path: 'src/routes/__root.tsx' },
          { type: 'file', name: 'index.tsx', path: 'src/routes/index.tsx' },
          { type: 'file', name: 'about.tsx', path: 'src/routes/about.tsx' },
        ],
      },
      {
        type: 'folder',
        name: 'lib',
        path: 'src/lib',
        children: [
          { type: 'file', name: 'utils.ts', path: 'src/lib/utils.ts' },
          { type: 'file', name: 'auth.ts', path: 'src/lib/auth.ts' },
        ],
      },
      { type: 'file', name: 'main.tsx', path: 'src/main.tsx' },
      { type: 'file', name: 'index.css', path: 'src/index.css' },
    ],
  },
  {
    type: 'folder',
    name: 'public',
    path: 'public',
    children: [
      { type: 'file', name: 'favicon.ico', path: 'public/favicon.ico' },
      { type: 'file', name: 'robots.txt', path: 'public/robots.txt' },
    ],
  },
  { type: 'file', name: 'package.json', path: 'package.json' },
  { type: 'file', name: 'tsconfig.json', path: 'tsconfig.json' },
  { type: 'file', name: 'vite.config.ts', path: 'vite.config.ts' },
]

export const defaultExpanded = new Set(['src', 'src/components', 'src/routes'])
