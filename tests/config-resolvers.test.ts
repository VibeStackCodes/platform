import { describe, it, expect } from 'vitest'
import { resolveBg, resolveSpacing, resolveCardVariant, resolveGridCols, resolveImageAspect } from '../server/lib/sections/primitives'

describe('resolveBg', () => {
  it('returns bg-background for default', () => {
    expect(resolveBg({})).toBe('bg-background')
    expect(resolveBg({ background: 'default' })).toBe('bg-background')
  })
  it('maps all 8 enum values', () => {
    expect(resolveBg({ background: 'muted' })).toBe('bg-muted/30')
    expect(resolveBg({ background: 'muted-strong' })).toBe('bg-muted/50')
    expect(resolveBg({ background: 'accent' })).toBe('bg-primary/10')
    expect(resolveBg({ background: 'dark' })).toBe('bg-foreground text-background')
    expect(resolveBg({ background: 'dark-overlay' })).toBe('relative bg-black/70')
    expect(resolveBg({ background: 'gradient-down' })).toBe('bg-gradient-to-b from-background to-muted/30')
    expect(resolveBg({ background: 'gradient-up' })).toBe('bg-gradient-to-t from-muted/30 to-background')
  })
})

describe('resolveSpacing', () => {
  it('returns normal padding by default', () => {
    expect(resolveSpacing({})).toBe('py-12 md:py-16')
  })
  it('maps compact and generous', () => {
    expect(resolveSpacing({ spacing: 'compact' })).toBe('py-8 md:py-12')
    expect(resolveSpacing({ spacing: 'generous' })).toBe('py-16 md:py-24 lg:py-32')
  })
})

describe('resolveCardVariant', () => {
  it('returns elevated by default', () => {
    expect(resolveCardVariant({})).toBe('shadow-lg hover:shadow-xl rounded-xl')
  })
  it('maps all 4 variants', () => {
    expect(resolveCardVariant({ cardVariant: 'flat' })).toBe('border border-border rounded-lg')
    expect(resolveCardVariant({ cardVariant: 'glass' })).toContain('backdrop-blur')
    expect(resolveCardVariant({ cardVariant: 'image-overlay' })).toContain('overflow-hidden')
  })
})

describe('resolveGridCols', () => {
  it('returns 3-col by default', () => {
    expect(resolveGridCols({})).toContain('lg:grid-cols-3')
  })
  it('maps 2 and 4 columns', () => {
    expect(resolveGridCols({ gridColumns: '2' })).toContain('sm:grid-cols-2')
    expect(resolveGridCols({ gridColumns: '2' })).not.toContain('lg:')
    expect(resolveGridCols({ gridColumns: '4' })).toContain('lg:grid-cols-4')
  })
})

describe('resolveImageAspect', () => {
  it('returns aspect-video by default', () => {
    expect(resolveImageAspect({})).toBe('aspect-video')
  })
  it('maps all 5 aspects', () => {
    expect(resolveImageAspect({ imageAspect: 'square' })).toBe('aspect-square')
    expect(resolveImageAspect({ imageAspect: '4/3' })).toBe('aspect-[4/3]')
    expect(resolveImageAspect({ imageAspect: '3/2' })).toBe('aspect-[3/2]')
    expect(resolveImageAspect({ imageAspect: '21/9' })).toBe('aspect-[21/9]')
  })
})
