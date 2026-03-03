import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'
import { nanoid } from 'nanoid'

// Handle CommonJS default export interop for babel packages
const traverse = (typeof _traverse === 'function' ? _traverse : (_traverse as unknown as { default: typeof _traverse }).default) as typeof _traverse
const generate = (typeof _generate === 'function' ? _generate : (_generate as unknown as { default: typeof _generate }).default) as typeof _generate

const OID_ATTR = 'data-oid'
const OID_LENGTH = 7

function isJsxFile(filePath: string): boolean {
  return /\.[jt]sx$/.test(filePath)
}

/**
 * Injects `data-oid` attributes onto JSX opening elements that don't already have one.
 *
 * - Only processes `.tsx` and `.jsx` files (returns source unchanged for all others)
 * - Skips elements that already carry a `data-oid` attribute (stable across edits)
 * - Skips React Fragment shorthand `<>` and `<Fragment>` / `<React.Fragment>`
 * - Uses `retainLines: true` in the generator to minimise diff noise
 */
export function injectOids(source: string, filePath: string): string {
  if (!isJsxFile(filePath)) return source

  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  })

  traverse(ast, {
    JSXOpeningElement(path) {
      const attrs = path.node.attributes

      // Skip if already has data-oid
      const hasOid = attrs.some(
        (attr) =>
          t.isJSXAttribute(attr) &&
          t.isJSXIdentifier(attr.name) &&
          attr.name.name === OID_ATTR,
      )
      if (hasOid) return

      // Skip React fragments: <> (JSXOpeningFragment is a separate node type,
      // but guard against any explicit Fragment identifier as well)
      const name = path.node.name
      if (t.isJSXIdentifier(name) && name.name === 'Fragment') return
      if (
        t.isJSXMemberExpression(name) &&
        t.isJSXIdentifier(name.property) &&
        name.property.name === 'Fragment'
      )
        return

      // Prepend new data-oid attribute so it appears first in the element
      const oidAttr = t.jsxAttribute(
        t.jsxIdentifier(OID_ATTR),
        t.stringLiteral(nanoid(OID_LENGTH)),
      )
      attrs.unshift(oidAttr)
    },
  })

  const { code } = generate(ast, { retainLines: true })
  return code
}

/**
 * Quick heuristic check: returns `true` if the source string contains any
 * `data-oid=` attribute, without fully parsing the AST.
 */
export function hasOids(source: string): boolean {
  return source.includes('data-oid=')
}
