/**
 * VibeStack Overlay — element selection bridge
 *
 * Listens for VIBESTACK_EDIT_MODE postMessage from parent frame.
 * When active, highlights elements on hover and sends selection data on click.
 *
 * Protocol:
 *   Parent → iframe: { type: 'VIBESTACK_EDIT_MODE', enabled: boolean }
 *   iframe → Parent: { type: 'VIBESTACK_ELEMENT_SELECTED', payload: ElementContext }
 */
;(function () {
  let editMode = false
  let highlightEl = null

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

  function getVsId(el) {
    // Walk up DOM to find nearest element with data-vs-id
    let current = el
    while (current && current !== document.body) {
      if (current.dataset && current.dataset.vsId) {
        return current
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
    const tagged = getVsId(e.target)
    if (!tagged) {
      if (highlightEl) highlightEl.style.display = 'none'
      return
    }
    const rect = tagged.getBoundingClientRect()
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

    const tagged = getVsId(e.target)
    if (!tagged) return

    const rect = tagged.getBoundingClientRect()
    const payload = {
      vsId: tagged.dataset.vsId,
      tagName: tagged.tagName.toLowerCase(),
      className: tagged.className || '',
      textContent: (tagged.textContent || '').trim().slice(0, 100),
      tailwindClasses: extractTailwindClasses(tagged.className),
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
