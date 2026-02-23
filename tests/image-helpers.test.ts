import { describe, it, expect } from 'vitest'
import { imageSrc, imageTag } from '@server/lib/sections/image-helpers'

describe('imageSrc', () => {
  it('generates img.vibestack.codes URL', () => {
    const url = imageSrc('cozy coffee shop morning light', 800, 600)
    expect(url).toBe('https://img.vibestack.codes/s/cozy%20coffee%20shop%20morning%20light/800/600')
  })

  it('appends crop param', () => {
    const url = imageSrc('professional headshot woman', 200, 200, 'faces')
    expect(url).toContain('?crop=faces')
  })
})

describe('imageTag', () => {
  it('includes alt, loading, onError fallback', () => {
    const tag = imageTag({
      src: 'IMAGES.hero.src',
      alt: 'City skyline at night',
      loading: 'eager',
      className: 'w-full h-[500px] object-cover',
    })
    expect(tag).toContain('alt="City skyline at night"')
    expect(tag).toContain('loading="eager"')
    expect(tag).toContain('onError=')
    expect(tag).toContain('linear-gradient')
    expect(tag).toContain('object-cover')
  })

  it('defaults to lazy loading', () => {
    const tag = imageTag({ src: 'img', alt: 'test' })
    expect(tag).toContain('loading="lazy"')
  })
})
