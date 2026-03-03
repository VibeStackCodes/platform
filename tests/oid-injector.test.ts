import { describe, it, expect } from 'vitest'
import { injectOids, hasOids } from '@server/lib/editor/oid-injector'

describe('oid-injector', () => {
  it('adds data-oid to JSX elements', () => {
    const input = `export default function App() {
  return <div><h1>Hello</h1></div>
}`
    const result = injectOids(input, 'src/App.tsx')
    expect(result).toContain('data-oid=')
    // Both div and h1 should get OIDs
    const matches = result.match(/data-oid="/g)
    expect(matches?.length).toBe(2)
  })

  it('preserves existing data-oid attributes', () => {
    const input = `export default function App() {
  return <div data-oid="abc1234"><h1>Hello</h1></div>
}`
    const result = injectOids(input, 'src/App.tsx')
    expect(result).toContain('data-oid="abc1234"')
    // div keeps existing, h1 gets new one
    const matches = result.match(/data-oid="/g)
    expect(matches?.length).toBe(2)
  })

  it('skips non-JSX files', () => {
    const input = 'const x = 1'
    expect(injectOids(input, 'src/utils.ts')).toBe(input)
  })

  it('skips React fragments', () => {
    const input = `export default function App() {
  return <><div>Hello</div></>
}`
    const result = injectOids(input, 'src/App.tsx')
    // Fragment should NOT get OID, div should
    const matches = result.match(/data-oid="/g)
    expect(matches?.length).toBe(1)
  })

  it('hasOids detects presence', () => {
    expect(hasOids('<div data-oid="abc1234">')).toBe(true)
    expect(hasOids('<div>')).toBe(false)
  })

  it('handles complex JSX with expressions', () => {
    const input = `export default function List({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}`
    const result = injectOids(input, 'src/List.tsx')
    expect(result).toContain('data-oid=')
    // ul and li should get OIDs
    const matches = result.match(/data-oid="/g)
    expect(matches?.length).toBe(2)
  })
})
