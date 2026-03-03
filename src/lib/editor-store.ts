import { create } from 'zustand'
import { nanoid } from 'nanoid'

// Inline the types to avoid circular deps with editor-types.ts
// (editor-types.ts is the canonical source, but store needs to be self-contained)

interface SerializedRect {
  x: number
  y: number
  width: number
  height: number
}

interface EditorElementInfo {
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

interface EditCommand {
  id: string
  file: string
  previousContent: string
  newContent: string
  timestamp: number
  description: string
}

type EditorMode = 'off' | 'select' | 'editing'

interface EditorStore {
  // State
  mode: EditorMode
  hoveredElement: EditorElementInfo | null
  selectedElement: EditorElementInfo | null
  isTextEditing: boolean
  undoStack: EditCommand[]
  redoStack: EditCommand[]
  isPatchInFlight: boolean

  // Actions
  setMode: (mode: EditorMode) => void
  toggleEditMode: () => void
  setHoveredElement: (el: EditorElementInfo | null) => void
  setSelectedElement: (el: EditorElementInfo | null) => void
  deselect: () => void
  startTextEditing: () => void
  stopTextEditing: () => void
  setPatchInFlight: (v: boolean) => void
  pushEdit: (cmd: Omit<EditCommand, 'id' | 'timestamp'>) => void
  undo: () => EditCommand | undefined
  redo: () => EditCommand | undefined
  clearHistory: () => void
  reset: () => void
}

const MAX_UNDO = 50

export const useEditorStore = create<EditorStore>((set, get) => ({
  mode: 'off',
  hoveredElement: null,
  selectedElement: null,
  isTextEditing: false,
  undoStack: [],
  redoStack: [],
  isPatchInFlight: false,

  setMode: (mode) => set({ mode, hoveredElement: null, selectedElement: null, isTextEditing: false }),

  toggleEditMode: () => {
    const current = get().mode
    set({
      mode: current === 'off' ? 'select' : 'off',
      hoveredElement: null,
      selectedElement: null,
      isTextEditing: false,
    })
  },

  setHoveredElement: (el) => set({ hoveredElement: el }),

  setSelectedElement: (el) => set({
    selectedElement: el,
    isTextEditing: false,
    mode: el ? 'select' : get().mode,
  }),

  deselect: () => set({ selectedElement: null, hoveredElement: null, isTextEditing: false }),

  startTextEditing: () => set({ isTextEditing: true, mode: 'editing' }),

  stopTextEditing: () => set({ isTextEditing: false, mode: 'select' }),

  setPatchInFlight: (v) => set({ isPatchInFlight: v }),

  pushEdit: (cmd) => {
    const full: EditCommand = {
      ...cmd,
      id: nanoid(10),
      timestamp: Date.now(),
    }
    set((s) => ({
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), full],
      redoStack: [], // clear redo on new edit
    }))
  },

  undo: () => {
    const { undoStack } = get()
    if (undoStack.length === 0) return undefined
    const cmd = undoStack[undoStack.length - 1]
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, cmd],
    }))
    return cmd
  },

  redo: () => {
    const { redoStack } = get()
    if (redoStack.length === 0) return undefined
    const cmd = redoStack[redoStack.length - 1]
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, cmd],
    }))
    return cmd
  },

  clearHistory: () => set({ undoStack: [], redoStack: [] }),

  reset: () => set({
    mode: 'off',
    hoveredElement: null,
    selectedElement: null,
    isTextEditing: false,
    undoStack: [],
    redoStack: [],
    isPatchInFlight: false,
  }),
}))
