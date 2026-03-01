import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useElementInteraction, type ElementInfo } from '@/hooks/use-element-interaction'
import { useDebouncedSave } from '@/hooks/use-debounced-save'
import { ElementOverlay } from './element-overlay'
import { ContextualToolbar } from './contextual-toolbar'
import { FormatMiniToolbar } from './format-mini-toolbar'
import { PropertyInspector } from './property-inspector'

export interface EditablePreviewProps {
  children: ReactNode
  className?: string
  onElementSelect?: (ctx: ElementInfo) => void
  onElementDeselect?: () => void
  onTextSave?: (elementId: string, text: string) => void
  onPropertyChange?: (elementId: string, prop: string, value: string) => void
  onAskAI?: (ctx: ElementInfo) => void
}

export function EditablePreview({
  children,
  className,
  onElementSelect,
  onElementDeselect,
  onTextSave,
  onPropertyChange,
  onAskAI,
}: EditablePreviewProps) {
  const { state, hoveredElement, selectedElement, containerRef, handlers, deselect, exitEditing } =
    useElementInteraction({
      onElementSelect,
      onElementDeselect,
    })

  const editableRef = useRef('')
  const { trigger: triggerTextSave } = useDebouncedSave({
    onSave: (content: string) => {
      if (selectedElement) {
        onTextSave?.(selectedElement.elementId, content)
      }
    },
  })

  // When entering editing mode, set up contentEditable on the element
  useEffect(() => {
    if (state === 'editing' && selectedElement) {
      const el = selectedElement.element
      editableRef.current = el.innerHTML
      el.contentEditable = 'true'
      el.focus()
      el.style.outline = 'none'

      const handleInput = () => {
        editableRef.current = el.innerHTML
        triggerTextSave(el.textContent ?? '')
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          exitEditing()
        }
      }

      el.addEventListener('input', handleInput)
      el.addEventListener('keydown', handleKeyDown)

      return () => {
        el.contentEditable = 'false'
        el.removeEventListener('input', handleInput)
        el.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [state, selectedElement, exitEditing, triggerTextSave])

  // Click-away handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      if (!container.contains(e.target as Node)) {
        deselect()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [containerRef, deselect])

  const handleAskAI = useCallback(() => {
    if (selectedElement) {
      onAskAI?.(selectedElement)
    }
  }, [selectedElement, onAskAI])

  return (
    <div className={cn('relative flex h-full', className)}>
      {/* Preview canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto"
        style={{ cursor: state === 'editing' ? 'text' : 'default' }}
        {...handlers}
        // biome-ignore lint: tabIndex needed for keyboard events
        tabIndex={0}
      >
        {/* Actual preview content */}
        {children}

        {/* Overlay layer */}
        <ElementOverlay
          hoveredElement={hoveredElement}
          selectedElement={selectedElement}
          containerRef={containerRef}
        />

        {/* Contextual toolbar — shown when selected but NOT editing */}
        {state === 'selected' && selectedElement && (
          <ContextualToolbar
            element={selectedElement}
            onAskAI={handleAskAI}
            onAction={(action) => {
              if (action === 'edit-text' && selectedElement.elementType === 'text') {
                // Trigger editing mode programmatically
                const el = selectedElement.element
                el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
              }
            }}
          />
        )}

        {/* Format mini-toolbar — shown during text editing */}
        {state === 'editing' && selectedElement && (
          <FormatMiniToolbar
            element={selectedElement}
            onFormat={(format) => {
              document.execCommand(format, false)
            }}
          />
        )}
      </div>

      {/* Property Inspector sidebar — shown when element is selected */}
      {(state === 'selected' || state === 'editing') && selectedElement && (
        <PropertyInspector
          element={selectedElement}
          onPropertyChange={onPropertyChange}
          onClose={deselect}
        />
      )}
    </div>
  )
}
