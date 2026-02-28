import { DiffViewer } from '@/components/ai-elements/diff-viewer'
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from '@/components/ai-elements/file-tree'

const OLD_CONTENT = `import { useState } from 'react'

export function App() {
  return <div>Hello</div>
}`

const NEW_CONTENT = `import { useState } from 'react'
import { Button } from './ui/button'

export function App() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <h1>Counter: {count}</h1>
      <Button onClick={() => setCount(c => c + 1)}>Increment</Button>
    </div>
  )
}`

export function CodeFiles() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-lg border border-border overflow-hidden flex flex-col" style={{ minHeight: 240 }}>
        <DiffViewer
          filename="src/App.tsx"
          oldContent={OLD_CONTENT}
          newContent={NEW_CONTENT}
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">
          Project Files
        </div>
        <FileTree
          defaultExpanded={new Set(['src', 'src/components'])}
          className="rounded-none border-0"
        >
          <FileTreeFolder path="src" name="src">
            <FileTreeFolder path="src/components" name="components">
              <FileTreeFile path="src/components/App.tsx" name="App.tsx" />
              <FileTreeFile path="src/components/Dashboard.tsx" name="Dashboard.tsx" />
            </FileTreeFolder>
            <FileTreeFolder path="src/lib" name="lib">
              <FileTreeFile path="src/lib/utils.ts" name="utils.ts" />
            </FileTreeFolder>
            <FileTreeFile path="src/main.tsx" name="main.tsx" />
          </FileTreeFolder>
          <FileTreeFile path="package.json" name="package.json" />
          <FileTreeFile path="vite.config.ts" name="vite.config.ts" />
        </FileTree>
      </div>
    </div>
  )
}
