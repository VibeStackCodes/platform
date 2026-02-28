import { ControlsPanel } from './controls-panel'
import { ExportDialog } from './export-dialog'
import { PreviewPanel } from './preview-panel'

export function ThemeEditor() {
  return (
    <div className="flex h-[calc(100vh-2rem)] overflow-hidden">
      <ControlsPanel />
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h1 className="text-lg font-semibold">Theme Editor</h1>
          <ExportDialog />
        </div>
        <PreviewPanel />
      </div>
    </div>
  )
}
