/**
 * Axe-core accessibility testing helper for section renderer JSX output.
 *
 * Transforms JSX string fragments → valid HTML → runs axe-core analysis.
 * Used by a11y test suites to validate section renderer output.
 *
 * Security note: innerHTML assignment is used intentionally here in a
 * Vitest/happy-dom test-only environment. The HTML content is produced
 * exclusively by our own section renderers (never from user input) and is
 * never exposed to a real browser DOM. The container is a synthetic node
 * attached to happy-dom's document body solely for axe-core traversal and
 * is removed immediately after analysis completes.
 */

import axe from 'axe-core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface A11yResult {
  violations: axe.Result[]
  passes: axe.Result[]
  incomplete: axe.Result[]
}

// ---------------------------------------------------------------------------
// HTML void elements — self-closing in JSX must not be self-closing in HTML
// ---------------------------------------------------------------------------

const HTML_VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

// ---------------------------------------------------------------------------
// Semantic component mapping — PascalCase → correct HTML element
// ---------------------------------------------------------------------------

/**
 * Map well-known React / shadcn / TanStack components to their semantic HTML
 * equivalents. Without this mapping, step 14 would turn them ALL into `<div>`,
 * which breaks:
 *   - aria-label on <Button> (div doesn't support aria-label without a role)
 *   - <Label htmlFor="id"> → <label for="id"> association for form fields
 *   - <Link> → <a> for hyperlink semantics
 */
const SEMANTIC_MAP: Record<string, string> = {
  // shadcn/ui components
  Button: 'button',
  Label: 'label',
  Input: 'input',
  Textarea: 'textarea',
  Badge: 'span',
  Separator: 'hr',
  // TanStack Router
  Link: 'a',
  // Sheet (Radix Dialog)
  SheetTrigger: 'button',
  SheetClose: 'button',
  SheetTitle: 'h2',
  // Tabs
  TabsTrigger: 'button',
  // Accordion
  AccordionTrigger: 'button',
}

// ---------------------------------------------------------------------------
// jsxToHtml
// ---------------------------------------------------------------------------

/**
 * Transform a JSX string fragment to valid HTML that axe-core can parse.
 *
 * Handles:
 * - `{/* ... *\/}` JSX comments → removed
 * - `className=` → `class=`
 * - `htmlFor=` → `for=`
 * - `{expression}` JSX interpolations → "placeholder" text
 * - Template literal attributes `attr={\`/path/${id}\`}` → `attr="/path/1"`
 * - React event handlers `onClick={...}` etc. → stripped
 * - `aria-expanded={variable}` boolean-ish aria attrs → `aria-expanded="false"`
 * - `disabled={expr}` → stripped (absence = not disabled)
 * - `required={expr}` → `required="true"`
 * - `style={{ ... }}` inline object styles → stripped
 * - Self-closing void elements `<img ... />` → `<img ...>`
 * - Non-void self-closing components `<Button ... />` → `<button ...></button>`
 * - Conditional renders `{condition && (<jsx>)}` → inner JSX content
 * - Ternary renders `{condition ? <a> : <b>}` → first branch
 * - PascalCase component tags → lowercased `<div>` wrappers
 */
export function jsxToHtml(jsx: string): string {
  let html = jsx

  // 1. Remove JSX block comments: {/* ... */}
  html = html.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

  // 2. Strip `style={{ ... }}` — handle nested braces (object literal)
  html = html.replace(/\s+style=\{\{[\s\S]*?\}\}/g, '')

  // 3. Strip React event handlers onXxx={...} — two passes for nested braces
  html = html.replace(/\s+on[A-Z][a-zA-Z]*=\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g, '')
  html = html.replace(/\s+on[A-Z][a-zA-Z]*=\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g, '')

  // 4. Normalize aria-* JSX expressions: aria-attr={expr} → aria-attr="false"
  //    Must run before the generic {expr} stripper so axe receives a real value.
  html = html.replace(/\b(aria-[a-z][a-z-]*)=\{[^}]*\}/g, '$1="false"')

  // 5. Drop disabled={expr} — absence means not disabled; let axe decide
  html = html.replace(/\s+disabled=\{[^}]*\}/g, '')

  // 6. Normalize required={expr} → required="true"
  html = html.replace(/\brequired=\{[^}]*\}/g, 'required="true"')

  // 7. Handle template literal attributes: attr={`/path/${expr}`} → attr="/path/1"
  html = html.replace(/=\{`([^`]*)`\}/g, (_match, tpl: string) => {
    const resolved = tpl.replace(/\$\{[^}]+\}/g, '1')
    return `="${resolved}"`
  })

  // 7.5. Strip React fragments (<>, </>) — they have no HTML equivalent
  html = html.replace(/<>/g, '')
  html = html.replace(/<\/>/g, '')

  // 7.6. Pre-flatten simple variable expressions {varName} → "placeholder"
  //      before conditional extraction. This prevents nested braces like
  //      {cond && (<li>{varName}</li>)} from causing step 8's regex to
  //      terminate at the inner `}` instead of the outer one.
  //      Pattern: only matches bare identifiers (no spaces, no operators).
  html = html.replace(/\{([a-zA-Z_$][a-zA-Z0-9_$.]*)\}/g, 'placeholder')

  // 8. Strip conditional renders: {condition && (<jsx>)} → inner JSX content
  html = html.replace(/\{[^{}]+&&\s*\(?([\s\S]*?)\)?\s*\}/g, '$1')

  // 9. Strip ternary renders: {cond ? <a> : <b>} → first branch only
  html = html.replace(
    /\{[^{}]*\?([^:{}]*(?:\{[^{}]*\}[^:{}]*)*):[^{}]*\}/g,
    '$1',
  )

  // 10. Replace remaining {expr} containers with "placeholder" text.
  //     Run up to 5 passes to unwrap nesting (innermost first each pass).
  for (let pass = 0; pass < 5; pass++) {
    const before = html
    html = html.replace(/\{[^{}]+\}/g, 'placeholder')
    if (html === before) break
  }


  // 11. className= → class=
  html = html.replace(/\bclassName=/g, 'class=')

  // 12. htmlFor= → for=
  html = html.replace(/\bhtmlFor=/g, 'for=')

  // 13. Fix self-closing tags.
  //     - Void elements: <img ... /> → <img ...>
  //     - Known components: <Button ... /> → <button ...></button> (via SEMANTIC_MAP)
  //     - All other self-closing: <Foo ... /> → <div ...></div>
  html = html.replace(
    /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)\/>/g,
    (_match, tag: string, attrs: string) => {
      const mapped = SEMANTIC_MAP[tag] ?? tag.toLowerCase()
      if (HTML_VOID_ELEMENTS.has(mapped)) {
        return `<${mapped}${attrs}>`
      }
      return `<${mapped}${attrs}></${mapped}>`
    },
  )

  // 14. Lowercase remaining PascalCase component tags. Known components use
  //     their semantic HTML equivalent (SEMANTIC_MAP); unknown ones become <div>.
  html = html.replace(
    /<([A-Z][a-zA-Z0-9]*)((?:\s[^>]*)?)>/g,
    (_match, tag: string, attrs: string) => {
      const mapped = SEMANTIC_MAP[tag] ?? 'div'
      return `<${mapped}${attrs}>`
    },
  )
  html = html.replace(/<\/([A-Z][a-zA-Z0-9]*)>/g, (_match, tag: string) => {
    const mapped = SEMANTIC_MAP[tag] ?? 'div'
    return `</${mapped}>`
  })

  // 15. Strip residual TypeScript inline type annotations from stringified
  //     map callbacks (e.g. `: Record<string, unknown>`, `: number`).
  html = html.replace(/:\s*Record<[^>]+>/g, '')
  html = html.replace(/:\s*(?:number|string|boolean)\b/g, '')

  return html
}

// ---------------------------------------------------------------------------
// setInnerHtml — thin wrapper that satisfies the security linter pattern
// while keeping the security context comment co-located with the assignment.
// ---------------------------------------------------------------------------

/**
 * Set the inner HTML of a container in the happy-dom test environment.
 *
 * This is safe here because:
 *  1. We are inside a Vitest/happy-dom environment — not a real browser.
 *  2. The content is produced by our own section renderers, not user input.
 *  3. The container is a synthetic element attached only for axe-core traversal
 *     and is detached immediately after the analysis completes.
 */
function setTestContainerHtml(container: HTMLDivElement, html: string): void {
  // nosec: test-only, renderer-controlled content, happy-dom synthetic DOM
  container.innerHTML = html // NOSONAR
}

// ---------------------------------------------------------------------------
// checkA11y
// ---------------------------------------------------------------------------

/**
 * Run axe-core analysis on a JSX string fragment.
 *
 * Converts the string to HTML, attaches a container to the happy-dom
 * document, runs axe with a curated rule set, then detaches the container.
 *
 * Rules ENABLED (critical + serious violations cause test failure):
 *   image-alt, label, heading-order, aria-roles, button-name, link-name,
 *   duplicate-id, list, listitem, aria-required-attr, aria-valid-attr,
 *   aria-valid-attr-value, aria-prohibited-attr, aria-hidden-focus,
 *   role-img-alt, input-button-name, select-name, form-field-multiple-labels
 *
 * Rules DISABLED (cannot be evaluated from static string fragments):
 *   color-contrast    — CSS custom properties don't resolve in happy-dom
 *   target-size       — pixel dimensions unavailable from strings
 *   region            — fragments are not full pages
 *   landmark-one-main — fragments, not full pages
 *   page-has-heading-one — fragments, not full pages
 *   bypass            — fragments, not full pages
 */
export async function checkA11y(jsxString: string): Promise<A11yResult> {
  const html = jsxToHtml(jsxString)

  const container = document.createElement('div')
  container.setAttribute('data-axe-container', 'true')
  setTestContainerHtml(container, html)
  document.body.appendChild(container)

  try {
    const result = await axe.run(container, {
      runOnly: {
        type: 'rule',
        values: [
          'image-alt',
          'label',
          'heading-order',
          'aria-roles',
          'button-name',
          'link-name',
          'duplicate-id',
          'list',
          'listitem',
          'aria-required-attr',
          'aria-valid-attr',
          'aria-valid-attr-value',
          'aria-prohibited-attr',
          'aria-hidden-focus',
          'role-img-alt',
          'input-button-name',
          'select-name',
          'form-field-multiple-labels',
        ],
      },
    })

    return {
      violations: result.violations,
      passes: result.passes,
      incomplete: result.incomplete,
    }
  } finally {
    // Detach the container to prevent DOM leakage between tests
    document.body.removeChild(container)
  }
}

// ---------------------------------------------------------------------------
// assertNoViolations
// ---------------------------------------------------------------------------

/**
 * Assert no critical or serious accessibility violations.
 * Throws a descriptive error listing each violation if any are found.
 */
export function assertNoViolations(result: A11yResult): void {
  const blocking = result.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  )

  if (blocking.length === 0) return

  const lines: string[] = [
    `Found ${blocking.length} accessibility violation(s):`,
    '',
  ]

  for (const violation of blocking) {
    lines.push(`  [${violation.impact?.toUpperCase() ?? 'UNKNOWN'}] ${violation.id}`)
    lines.push(`    ${violation.description}`)
    lines.push(`    Help: ${violation.helpUrl}`)

    for (const node of violation.nodes) {
      const selector = node.target.join(', ')
      lines.push(`    Node: ${selector}`)
      if (node.failureSummary) {
        const indented = node.failureSummary
          .split('\n')
          .map((line) => `      ${line}`)
          .join('\n')
        lines.push(indented)
      }
    }

    lines.push('')
  }

  throw new Error(lines.join('\n'))
}
