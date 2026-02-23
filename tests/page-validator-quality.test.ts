import { describe, it, expect } from 'vitest'
import { detectAntiPatterns, type AntiPatternViolation } from '@server/lib/page-validator'

describe('detectAntiPatterns', () => {
  it('flags Lorem ipsum', () => {
    const code = '<p>Lorem ipsum dolor sit amet</p>'
    const violations = detectAntiPatterns(code)
    expect(violations.some((v: AntiPatternViolation) => v.rule === 'placeholder-text')).toBe(true)
  })

  it('flags generic CTA text', () => {
    const code = '<Button>Get Started</Button><Button>Learn More</Button><Button>Get Started</Button>'
    const violations = detectAntiPatterns(code)
    expect(violations.some((v: AntiPatternViolation) => v.rule === 'generic-cta')).toBe(true)
  })

  it('flags buzzwords', () => {
    const code = '<p>Our seamless cutting-edge revolutionary platform leverages synergy</p>'
    const violations = detectAntiPatterns(code)
    expect(violations.some((v: AntiPatternViolation) => v.rule === 'buzzword')).toBe(true)
  })

  it('flags empty onClick handlers', () => {
    const code = '<button onClick={() => {}}>Click me</button>'
    const violations = detectAntiPatterns(code)
    expect(violations.some((v: AntiPatternViolation) => v.rule === 'empty-handler')).toBe(true)
  })

  it('flags missing img alt', () => {
    const code = '<img src="test.jpg" />'
    const violations = detectAntiPatterns(code)
    expect(violations.some((v: AntiPatternViolation) => v.rule === 'img-missing-alt')).toBe(true)
  })

  it('flags missing img onError', () => {
    const code = '<img src="test.jpg" alt="test" />'
    const violations = detectAntiPatterns(code)
    expect(violations.some((v: AntiPatternViolation) => v.rule === 'img-missing-onerror')).toBe(true)
  })

  it('passes clean code', () => {
    const code = `
      <section id="hero">
        <img src={IMAGES.hero.src} alt="Hero image" onError={(e) => { e.target.style.display = 'none' }} />
        <h1>Craft Coffee Roasters</h1>
        <p>Small-batch specialty coffee from Brooklyn</p>
        <Button onClick={() => setView('menu')}>View Our Roasts</Button>
      </section>
    `
    const violations = detectAntiPatterns(code)
    expect(violations).toHaveLength(0)
  })
})
