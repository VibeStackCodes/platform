// VibeStack Overlay — element selection for visual editing
// Activated by parent postMessage: { type: 'VIBESTACK_ENTER_EDIT_MODE' }
// Deactivated by: { type: 'VIBESTACK_EXIT_EDIT_MODE' }
;(function () {
  var active = false
  var highlightEl = null

  function createHighlight() {
    var el = document.createElement('div')
    el.id = 'vibestack-highlight'
    el.style.cssText =
      'position:fixed;pointer-events:none;border:2px solid #3b82f6;border-radius:4px;' +
      'background:rgba(59,130,246,0.08);z-index:99999;display:none;transition:all 0.1s ease'
    document.body.appendChild(el)
    return el
  }

  /**
   * Walk up DOM tree to find the nearest element with data-source-file attribute.
   * @param {Element} target
   * @returns {Element|null}
   */
  function findSourceElement(target) {
    var el = target
    while (el && el !== document.body) {
      if (el.getAttribute && el.getAttribute('data-source-file')) return el
      el = el.parentElement
    }
    return null
  }

  /**
   * Extract a subset of computed styles relevant for visual editing.
   * @param {Element} el
   * @returns {Object}
   */
  function getComputedProps(el) {
    var s = window.getComputedStyle(el)
    return {
      color: s.color,
      backgroundColor: s.backgroundColor,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      padding: s.padding,
      margin: s.margin,
      textAlign: s.textAlign,
    }
  }

  function handleMouseMove(e) {
    if (!active) return
    var source = findSourceElement(e.target)
    if (source) {
      if (!highlightEl) highlightEl = createHighlight()
      var r = source.getBoundingClientRect()
      highlightEl.style.top = r.top + 'px'
      highlightEl.style.left = r.left + 'px'
      highlightEl.style.width = r.width + 'px'
      highlightEl.style.height = r.height + 'px'
      highlightEl.style.display = 'block'
    } else if (highlightEl) {
      highlightEl.style.display = 'none'
    }
  }

  function handleClick(e) {
    if (!active) return
    var source = findSourceElement(e.target)
    if (!source) return
    e.preventDefault()
    e.stopPropagation()

    var rect = source.getBoundingClientRect()
    var className = source.className || ''
    var payload = {
      fileName: source.getAttribute('data-source-file') || '',
      lineNumber: parseInt(source.getAttribute('data-source-line') || '0', 10),
      columnNumber: 0,
      tagName: source.tagName.toLowerCase(),
      className: className,
      textContent: (source.textContent || '').trim().slice(0, 200),
      tailwindClasses: className.split(/\s+/).filter(Boolean),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      computedStyles: getComputedProps(source),
    }

    window.parent.postMessage({ type: 'VIBESTACK_ELEMENT_SELECTED', payload: payload }, '*')
  }

  window.addEventListener('message', function (e) {
    if (!e.data) return
    if (e.data.type === 'VIBESTACK_ENTER_EDIT_MODE') {
      active = true
      if (!highlightEl) highlightEl = createHighlight()
      document.body.style.cursor = 'crosshair'
    }
    if (e.data.type === 'VIBESTACK_EXIT_EDIT_MODE') {
      active = false
      if (highlightEl) highlightEl.style.display = 'none'
      document.body.style.cursor = ''
    }
  })

  document.addEventListener('mousemove', handleMouseMove, { passive: true })
  document.addEventListener('click', handleClick, true)
})()
