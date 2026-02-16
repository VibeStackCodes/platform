/**
 * VibeStack Overlay — element selection bridge (lovable-tagger edition)
 *
 * Listens for VIBESTACK_EDIT_MODE postMessage from parent frame.
 * When active, highlights elements on hover and sends selection data on click.
 *
 * Uses lovable-tagger's Symbol-based element tracking instead of DOM attributes.
 * Each React element gets Symbol.for("__jsxSource__") metadata with fileName, lineNumber, columnNumber.
 *
 * Protocol:
 *   Parent → iframe: { type: 'VIBESTACK_EDIT_MODE', enabled: boolean }
 *   iframe → Parent: { type: 'VIBESTACK_ELEMENT_SELECTED', payload: ElementContext }
 */
;(function () {
  let editMode = false
  let highlightEl = null

  // Symbol key used by lovable-tagger for source metadata
  const SOURCE_KEY = Symbol.for('__jsxSource__')

  // Create highlight overlay element
  function createHighlight() {
    const el = document.createElement('div')
    el.id = 'vs-highlight'
    el.style.cssText =
      'position:fixed;pointer-events:none;border:2px solid #6366f1;background:rgba(99,102,241,0.1);' +
      'border-radius:4px;z-index:2147483647;transition:all 0.1s ease;display:none;'
    document.body.appendChild(el)
    return el
  }

  /**
   * Walk up DOM tree to find nearest element with __jsxSource__ metadata
   * Returns { element, source } or null
   */
  function getSourceInfo(el) {
    let current = el
    while (current && current !== document.body) {
      const source = current[SOURCE_KEY]
      if (source && source.fileName) {
        return { element: current, source: source }
      }
      current = current.parentElement
    }
    return null
  }

  function extractTailwindClasses(className) {
    if (!className) return []
    return className
      .split(/\s+/)
      .filter(function (cls) {
        // Basic Tailwind class detection: has a prefix with dash
        return /^[a-z]+-/.test(cls) || /^-?[a-z]+$/.test(cls)
      })
  }

  function handleMouseMove(e) {
    if (!editMode) return
    const info = getSourceInfo(e.target)
    if (!info) {
      if (highlightEl) highlightEl.style.display = 'none'
      return
    }
    const rect = info.element.getBoundingClientRect()
    if (!highlightEl) highlightEl = createHighlight()
    highlightEl.style.display = 'block'
    highlightEl.style.left = rect.left + 'px'
    highlightEl.style.top = rect.top + 'px'
    highlightEl.style.width = rect.width + 'px'
    highlightEl.style.height = rect.height + 'px'
  }

  function handleClick(e) {
    if (!editMode) return
    e.preventDefault()
    e.stopPropagation()

    const info = getSourceInfo(e.target)
    if (!info) return

    const rect = info.element.getBoundingClientRect()
    const sourceInfo = info.source

    const payload = {
      fileName: sourceInfo.fileName,
      lineNumber: sourceInfo.lineNumber,
      columnNumber: sourceInfo.columnNumber,
      tagName: info.element.tagName.toLowerCase(),
      className: info.element.className || '',
      textContent: (info.element.textContent || '').trim().slice(0, 100),
      tailwindClasses: extractTailwindClasses(info.element.className),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    }

    // Send to parent frame
    window.parent.postMessage(
      { type: 'VIBESTACK_ELEMENT_SELECTED', payload: payload },
      '*'
    )
  }

  // Listen for edit mode toggle from parent
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'VIBESTACK_EDIT_MODE') {
      editMode = !!event.data.enabled
      if (!editMode && highlightEl) {
        highlightEl.style.display = 'none'
      }
      // Change cursor to indicate edit mode
      document.body.style.cursor = editMode ? 'crosshair' : ''
    }
  })

  // Attach event listeners (capture phase for click to prevent element interactions)
  document.addEventListener('mousemove', handleMouseMove, { passive: true })
  document.addEventListener('click', handleClick, true)
})()
