import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('vibestack-overlay.js', () => {
  it('exists in snapshot/warmup-scaffold/public/', () => {
    const path = resolve(__dirname, '../snapshot/warmup-scaffold/public/vibestack-overlay.js')
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('VIBESTACK_ENTER_EDIT_MODE')
    expect(content).toContain('VIBESTACK_EXIT_EDIT_MODE')
    expect(content).toContain('VIBESTACK_ELEMENT_SELECTED')
    expect(content).toContain('data-source-file')
  })

  it('index.html includes the overlay script tag', () => {
    const path = resolve(__dirname, '../snapshot/warmup-scaffold/index.html')
    const content = readFileSync(path, 'utf-8')
    expect(content).toContain('vibestack-overlay.js')
  })
})
