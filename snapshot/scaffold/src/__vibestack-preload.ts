import { connectToParent } from 'penpal'

// ── Runtime ODID Assignment ──────────────────────────────────────────
let odidCounter = 0
const OID_ATTR = 'data-oid'
const ODID_ATTR = 'data-odid'

function assignOdids(root: Element = document.body) {
  root.querySelectorAll(`[${OID_ATTR}]`).forEach((el) => {
    if (!el.getAttribute(ODID_ATTR)) {
      el.setAttribute(ODID_ATTR, `odid-${odidCounter++}`)
    }
  })
}

// Watch for DOM changes and assign ODIDs to new elements
const observer = new MutationObserver(() => assignOdids())
observer.observe(document.body, { childList: true, subtree: true })
assignOdids()

// ── CSS Manager ──────────────────────────────────────────────────────
const styleEl = document.createElement('style')
styleEl.id = 'vibestack-editor-styles'
document.head.appendChild(styleEl)

const activeStyles = new Map<string, Record<string, string>>()

function rebuildStyleSheet() {
  const rules: string[] = []
  for (const [odid, styles] of activeStyles) {
    const props = Object.entries(styles)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}: ${v} !important`)
      .join('; ')
    rules.push(`[${ODID_ATTR}="${odid}"] { ${props} }`)
  }
  styleEl.textContent = rules.join('\n')
}

// ── Element Resolution ───────────────────────────────────────────────
function classifyElement(el: Element): 'text' | 'image' | 'button' | 'container' {
  const tag = el.tagName.toLowerCase()
  if (tag === 'img' || tag === 'svg' || tag === 'video') return 'image'
  if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') return 'button'
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'li'].includes(tag))
    return 'text'
  return 'container'
}

const TW_PREFIXES =
  /^(bg-|text-|font-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-|w-|h-|min-|max-|flex|grid|gap-|rounded|border|shadow|opacity-|z-|overflow|items-|justify-|self-|col-|row-|space-|divide-|ring-|outline-|transition|duration|ease|animate|sr-|not-|group|peer|dark:|hover:|focus:|active:|disabled:|sm:|md:|lg:|xl:|2xl:)/

function extractTailwindClasses(el: Element): string[] {
  return Array.from(el.classList).filter((c) => TW_PREFIXES.test(c))
}

function buildElementInfo(el: Element) {
  const oid = el.getAttribute(OID_ATTR) || ''
  const odid = el.getAttribute(ODID_ATTR) || ''
  const rect = el.getBoundingClientRect()
  const computed = window.getComputedStyle(el)
  const elementType = classifyElement(el)

  return {
    oid,
    odid,
    tagName: el.tagName.toLowerCase(),
    textContent: elementType === 'text' ? (el.textContent || '').trim().slice(0, 200) : '',
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    tailwindClasses: extractTailwindClasses(el),
    computedStyles: {
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      padding: computed.padding,
      margin: computed.margin,
      textAlign: computed.textAlign,
      display: computed.display,
      width: computed.width,
      height: computed.height,
      borderRadius: computed.borderRadius,
    },
    elementType,
    isEditable: elementType === 'text',
    imageSrc: el.tagName === 'IMG' ? (el as HTMLImageElement).src : undefined,
    parentOid:
      el.parentElement?.closest(`[${OID_ATTR}]`)?.getAttribute(OID_ATTR) || undefined,
  }
}

function findOidElement(el: Element | null): Element | null {
  if (!el) return null
  return el.closest(`[${OID_ATTR}]`)
}

// ── Text Editing ─────────────────────────────────────────────────────
let editingElement: HTMLElement | null = null

// ── Penpal Connection ────────────────────────────────────────────────
let editModeEnabled = false

const connection = connectToParent({
  methods: {
    getElementAtPoint(x: number, y: number) {
      const el = document.elementFromPoint(x, y)
      const oidEl = findOidElement(el)
      if (!oidEl) return null
      return buildElementInfo(oidEl)
    },

    getElementByOid(oid: string) {
      const el = document.querySelector(`[${OID_ATTR}="${oid}"]`)
      if (!el) return null
      return buildElementInfo(el)
    },

    getAllElements() {
      return Array.from(document.querySelectorAll(`[${OID_ATTR}]`)).map(buildElementInfo)
    },

    startTextEditing(oid: string) {
      const el = document.querySelector(`[${OID_ATTR}="${oid}"]`) as HTMLElement
      if (!el) return
      editingElement = el
      el.contentEditable = 'true'
      el.focus()
      // Select all text
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    },

    stopTextEditing() {
      if (!editingElement) return null
      const oid = editingElement.getAttribute(OID_ATTR) || ''
      const newText = editingElement.textContent || ''
      editingElement.contentEditable = 'false'
      editingElement.blur()
      editingElement = null
      return { oid, newText }
    },

    applyStylePreview(odid: string, styles: Record<string, string>) {
      activeStyles.set(odid, { ...(activeStyles.get(odid) || {}), ...styles })
      rebuildStyleSheet()
    },

    clearStylePreviews() {
      activeStyles.clear()
      rebuildStyleSheet()
    },

    clearStylePreview(odid: string) {
      activeStyles.delete(odid)
      rebuildStyleSheet()
    },

    getComputedStyles(oid: string) {
      const el = document.querySelector(`[${OID_ATTR}="${oid}"]`)
      if (!el) return {}
      const computed = window.getComputedStyle(el)
      return {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        padding: computed.padding,
        margin: computed.margin,
        textAlign: computed.textAlign,
      }
    },

    getTailwindClasses(oid: string) {
      const el = document.querySelector(`[${OID_ATTR}="${oid}"]`)
      if (!el) return []
      return extractTailwindClasses(el)
    },

    scrollToElement(oid: string) {
      const el = document.querySelector(`[${OID_ATTR}="${oid}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },

    getViewportScroll() {
      return { x: window.scrollX, y: window.scrollY }
    },

    setEditMode(enabled: boolean) {
      editModeEnabled = enabled
      document.body.style.cursor = enabled ? 'default' : ''
    },

    highlightElement(_oid: string) {
      // Highlight handled by parent overlay — no-op in iframe
    },

    unhighlightElement() {
      // No-op
    },
  },
})

connection.promise.then(() => {
  console.log('[vibestack-editor] Connected to parent via Penpal')
})
