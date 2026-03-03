import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'

// Handle CommonJS default export interop for babel packages (matches oid-injector.ts pattern)
const traverse = (
  typeof _traverse === 'function'
    ? _traverse
    : (_traverse as unknown as { default: typeof _traverse }).default
) as typeof _traverse

const generate = (
  typeof _generate === 'function'
    ? _generate
    : (_generate as unknown as { default: typeof _generate }).default
) as typeof _generate

export interface PatchOperation {
  oid: string
  type: 'text' | 'className' | 'attribute' | 'reorder'
  value: string
}

/**
 * Apply a single visual-editor patch to a JSX source file.
 *
 * Locates the element carrying `data-oid="<oid>"` and mutates its AST
 * node according to the operation type:
 *
 * - `className`  — replace or insert the `className` prop value
 * - `attribute`  — set/replace a named prop; `value` must be `"attrName=attrValue"`
 * - `text`       — replace the first text child of the element
 * - `reorder`    — swap element up/down among JSX siblings; `value` must be `"up"` or `"down"`
 *
 * Returns the regenerated source. Throws if the OID is not found.
 */
export function patchSource(source: string, operation: PatchOperation): string {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  })

  let patched = false

  traverse(ast, {
    JSXOpeningElement(path) {
      // Find the element with matching data-oid
      const oidAttr = path.node.attributes.find(
        (attr) =>
          t.isJSXAttribute(attr) &&
          t.isJSXIdentifier(attr.name) &&
          attr.name.name === 'data-oid' &&
          t.isStringLiteral(attr.value) &&
          attr.value.value === operation.oid,
      )
      if (!oidAttr) return

      if (operation.type === 'className') {
        const classAttr = path.node.attributes.find(
          (attr) =>
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name) &&
            attr.name.name === 'className',
        )
        if (classAttr && t.isJSXAttribute(classAttr)) {
          classAttr.value = t.stringLiteral(operation.value)
        } else {
          // Add className attribute after data-oid
          path.node.attributes.push(
            t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(operation.value)),
          )
        }
        patched = true
      }

      if (operation.type === 'attribute') {
        // Expected format: "attrName=value"
        const eqIdx = operation.value.indexOf('=')
        if (eqIdx === -1) {
          throw new Error(
            `attribute patch value must be in "attrName=value" format, got: "${operation.value}"`,
          )
        }
        const attrName = operation.value.slice(0, eqIdx)
        const attrValue = operation.value.slice(eqIdx + 1)

        const existing = path.node.attributes.find(
          (attr) =>
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name) &&
            attr.name.name === attrName,
        )
        if (existing && t.isJSXAttribute(existing)) {
          existing.value = t.stringLiteral(attrValue)
        } else {
          path.node.attributes.push(
            t.jsxAttribute(t.jsxIdentifier(attrName), t.stringLiteral(attrValue)),
          )
        }
        patched = true
      }

      if (operation.type === 'text') {
        // path.parentPath is the JSXElement that owns this opening element
        const jsxElement = path.parentPath
        if (!jsxElement || !t.isJSXElement(jsxElement.node)) return

        const children = jsxElement.node.children
        let replaced = false
        for (let i = 0; i < children.length; i++) {
          if (t.isJSXText(children[i])) {
            // Only replace non-whitespace-only text nodes
            if ((children[i] as t.JSXText).value.trim() !== '') {
              children[i] = t.jsxText(operation.value)
              replaced = true
              break
            }
          } else if (t.isJSXExpressionContainer(children[i])) {
            const expr = (children[i] as t.JSXExpressionContainer).expression
            if (t.isStringLiteral(expr)) {
              ;(children[i] as t.JSXExpressionContainer).expression = t.stringLiteral(
                operation.value,
              )
              replaced = true
              break
            }
          }
        }

        if (!replaced) {
          // No text child found — append one
          children.push(t.jsxText(operation.value))
        }
        patched = true
      }

      if (operation.type === 'reorder') {
        const direction = operation.value
        if (direction !== 'up' && direction !== 'down') {
          throw new Error(`reorder value must be "up" or "down", got: "${direction}"`)
        }

        // path.parentPath is the JSXElement, its parentPath is the containing JSXElement
        const jsxElement = path.parentPath
        if (!jsxElement || !t.isJSXElement(jsxElement.node)) return

        const parentPath = jsxElement.parentPath
        if (!parentPath) return

        // Siblings can live in a JSXElement's children or a block statement's body
        let siblings: t.Node[] | null = null
        if (t.isJSXElement(parentPath.node)) {
          siblings = parentPath.node.children
        } else if (
          t.isBlockStatement(parentPath.node) ||
          t.isProgram(parentPath.node) ||
          t.isJSXFragment(parentPath.node)
        ) {
          // oxlint-disable-next-line typescript-eslint/no-explicit-any -- narrowing through body/children union
          siblings = (parentPath.node as any).children ?? (parentPath.node as any).body ?? null
        }

        if (!Array.isArray(siblings)) return

        const idx = siblings.indexOf(jsxElement.node)
        if (idx === -1) return

        if (direction === 'up' && idx > 0) {
          ;[siblings[idx - 1], siblings[idx]] = [siblings[idx], siblings[idx - 1]]
          patched = true
        } else if (direction === 'down' && idx < siblings.length - 1) {
          ;[siblings[idx], siblings[idx + 1]] = [siblings[idx + 1], siblings[idx]]
          patched = true
        }
        // If already at boundary, treat as a no-op (still mark patched — element was found)
        if (!patched) patched = true
      }
    },
  })

  if (!patched) {
    throw new Error(
      `Could not find element with data-oid="${operation.oid}" for "${operation.type}" patch`,
    )
  }

  const { code } = generate(ast, { retainLines: true })
  return code
}

/**
 * Scan an in-memory file map and return the path of the first file whose
 * source contains the given OID.  Returns `null` if no file matches.
 *
 * This is a fast heuristic (string search) — no AST parse needed here.
 */
export function findFileWithOid(files: Map<string, string>, oid: string): string | null {
  for (const [filePath, content] of files) {
    if (content.includes(`data-oid="${oid}"`)) return filePath
  }
  return null
}
