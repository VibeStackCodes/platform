/** Element info serialized from iframe to parent via Penpal */
export interface EditorElementInfo {
  oid: string
  odid: string
  tagName: string
  textContent: string
  rect: SerializedRect
  tailwindClasses: string[]
  computedStyles: Record<string, string>
  elementType: 'text' | 'image' | 'button' | 'container'
  isEditable: boolean
  imageSrc?: string
  parentOid?: string
}

export interface SerializedRect {
  x: number
  y: number
  width: number
  height: number
}

/** Methods exposed by iframe preload script (Penpal child) */
export interface PreloadChildMethods {
  getElementAtPoint(x: number, y: number): EditorElementInfo | null
  getElementByOid(oid: string): EditorElementInfo | null
  getAllElements(): EditorElementInfo[]
  startTextEditing(oid: string): void
  stopTextEditing(): { oid: string; newText: string } | null
  applyStylePreview(odid: string, styles: Record<string, string>): void
  clearStylePreviews(): void
  clearStylePreview(odid: string): void
  getComputedStyles(oid: string): Record<string, string>
  getTailwindClasses(oid: string): string[]
  scrollToElement(oid: string): void
  getViewportScroll(): { x: number; y: number }
  setEditMode(enabled: boolean): void
  highlightElement(oid: string): void
  unhighlightElement(): void
}

/** Methods exposed by parent (Penpal parent) */
export interface ParentMethods {
  onTextEditCommit(oid: string, newText: string): void
  onElementClicked(info: EditorElementInfo): void
}

/** Edit command for undo stack */
export interface EditCommand {
  id: string
  file: string
  previousContent: string
  newContent: string
  timestamp: number
  description: string
}

/** Edit request sent to /api/editor/patch */
export interface PatchRequest {
  projectId: string
  sandboxId: string
  edits: PatchEdit[]
}

export interface PatchEdit {
  file: string
  oid: string
  type: 'text' | 'className' | 'attribute' | 'reorder'
  value: string
  previousValue?: string
}

export interface PatchResponse {
  success: boolean
  results: Array<{
    file: string
    previousContent: string
    newContent: string
    error?: string
  }>
}

export type EditorMode = 'off' | 'select' | 'editing'

export interface EditorState {
  mode: EditorMode
  hoveredElement: EditorElementInfo | null
  selectedElement: EditorElementInfo | null
  isTextEditing: boolean
  undoStack: EditCommand[]
  redoStack: EditCommand[]
  isPatchInFlight: boolean
}
