import { useCallback, useRef, useState } from 'react'

export type InteractionState = 'idle' | 'hovering' | 'selected' | 'editing'

export interface ElementInfo {
  element: HTMLElement
  tagName: string
  className: string
  textContent: string
  elementId: string
  elementType: 'text' | 'image' | 'button' | 'container'
  rect: DOMRect
  tailwindClasses: string[]
  computedStyles: {
    color: string
    backgroundColor: string
    fontSize: string
    fontWeight: string
    padding: string
    margin: string
    textAlign: string
    display: string
    flexDirection: string
    gap: string
    borderRadius: string
    borderWidth: string
    borderColor: string
    opacity: string
    boxShadow: string
    width: string
    height: string
  }
}

function classifyElement(el: HTMLElement): ElementInfo['elementType'] {
  const tag = el.tagName.toLowerCase()
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label'].includes(tag)) return 'text'
  if (tag === 'img') return 'image'
  if (tag === 'button' || (tag === 'a' && el.classList.contains('btn'))) return 'button'
  return 'container'
}

function extractTailwindClasses(el: HTMLElement): string[] {
  return Array.from(el.classList).filter((cls) =>
    /^(bg-|text-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-|flex|grid|gap-|rounded|border|shadow|opacity-|w-|h-|min-|max-|font-|leading-|tracking-|items-|justify-|space-|overflow-)/.test(
      cls,
    ),
  )
}

function getComputedStyleProps(el: HTMLElement): ElementInfo['computedStyles'] {
  const cs = window.getComputedStyle(el)
  return {
    color: cs.color,
    backgroundColor: cs.backgroundColor,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    padding: cs.padding,
    margin: cs.margin,
    textAlign: cs.textAlign,
    display: cs.display,
    flexDirection: cs.flexDirection,
    gap: cs.gap,
    borderRadius: cs.borderRadius,
    borderWidth: cs.borderWidth,
    borderColor: cs.borderColor,
    opacity: cs.opacity,
    boxShadow: cs.boxShadow,
    width: cs.width,
    height: cs.height,
  }
}

function buildElementInfo(el: HTMLElement): ElementInfo {
  const tag = el.tagName.toLowerCase()
  return {
    element: el,
    tagName: tag,
    className: el.className,
    textContent: (el.textContent ?? '').slice(0, 200),
    elementId: el.dataset.elementId ?? `${tag}-${Math.random().toString(36).slice(2, 8)}`,
    elementType: classifyElement(el),
    rect: el.getBoundingClientRect(),
    tailwindClasses: extractTailwindClasses(el),
    computedStyles: getComputedStyleProps(el),
  }
}

/** Finds the nearest ancestor (or self) that has data-element-id or is a meaningful element */
function findSelectableElement(target: HTMLElement, container: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = target
  while (el && el !== container) {
    // Prefer elements with explicit data-element-id
    if (el.dataset.elementId) return el
    // Fall back to meaningful semantic elements
    const tag = el.tagName.toLowerCase()
    if (
      [
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'p',
        'img',
        'button',
        'a',
        'section',
        'article',
        'nav',
        'header',
        'footer',
        'main',
      ].includes(tag) ||
      (tag === 'div' && el.children.length > 0 && el.parentElement !== container)
    ) {
      return el
    }
    el = el.parentElement
  }
  return null
}

export interface UseElementInteractionOptions {
  onElementSelect?: (info: ElementInfo) => void
  onElementDeselect?: () => void
  onTextSave?: (elementId: string, text: string) => void
  onPropertyChange?: (elementId: string, prop: string, value: string) => void
}

export function useElementInteraction(options: UseElementInteractionOptions = {}) {
  const [state, setState] = useState<InteractionState>('idle')
  const [hoveredElement, setHoveredElement] = useState<ElementInfo | null>(null)
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (state === 'editing') return
      const container = containerRef.current
      if (!container) return
      const target = e.target as HTMLElement
      const selectable = findSelectableElement(target, container)
      if (selectable) {
        const info = buildElementInfo(selectable)
        setHoveredElement(info)
        if (state === 'idle') setState('hovering')
      } else {
        setHoveredElement(null)
        if (state === 'hovering') setState('idle')
      }
    },
    [state],
  )

  const handleMouseLeave = useCallback(() => {
    if (state === 'hovering') {
      setHoveredElement(null)
      setState('idle')
    }
  }, [state])

  const deselect = useCallback(() => {
    setSelectedElement(null)
    setState('idle')
    options.onElementDeselect?.()
  }, [options])

  const exitEditing = useCallback(() => {
    setState('selected')
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (state === 'editing') return
      e.preventDefault()
      e.stopPropagation()
      const container = containerRef.current
      if (!container) return
      const target = e.target as HTMLElement
      const selectable = findSelectableElement(target, container)
      if (selectable) {
        const info = buildElementInfo(selectable)
        setSelectedElement(info)
        setState('selected')
        options.onElementSelect?.(info)
      } else {
        deselect()
      }
    },
    [state, options, deselect],
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (state !== 'selected' || !selectedElement) return
      if (selectedElement.elementType !== 'text') return
      e.preventDefault()
      e.stopPropagation()
      setState('editing')
    },
    [state, selectedElement],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (state === 'editing') {
          exitEditing()
        } else if (state === 'selected') {
          deselect()
        }
      }
    },
    [state, deselect, exitEditing],
  )

  return {
    state,
    hoveredElement,
    selectedElement,
    containerRef,
    handlers: {
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
      onDoubleClick: handleDoubleClick,
      onKeyDown: handleKeyDown,
    },
    deselect,
    exitEditing,
  }
}
