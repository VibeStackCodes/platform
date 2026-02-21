import { describe, it, expect } from 'vitest'
import {
  SectionVisualSpecSchema,
  RouteSpecSchema,
  PageCompositionPlanV2Schema,
} from '@server/lib/agents/schemas'

describe('SectionVisualSpecSchema', () => {
  it('accepts valid spec with all fields', () => {
    const result = SectionVisualSpecSchema.safeParse({
      sectionId: 'hero-fullbleed',
      background: 'dark-overlay',
      spacing: 'generous',
      text: { headline: 'Welcome', subtext: 'Hello world' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown sectionId', () => {
    const result = SectionVisualSpecSchema.safeParse({ sectionId: 'hero-nonexistent' })
    expect(result.success).toBe(false)
  })

  it('rejects unknown background value', () => {
    const result = SectionVisualSpecSchema.safeParse({ sectionId: 'hero-fullbleed', background: 'rainbow' })
    expect(result.success).toBe(false)
  })

  it('applies defaults for background and spacing', () => {
    const result = SectionVisualSpecSchema.parse({ sectionId: 'grid-cards-3col', entityBinding: 'recipes' })
    expect(result.background).toBe('default')
    expect(result.spacing).toBe('normal')
    expect(result.showBadges).toBe(true)
    expect(result.showMetadata).toBe(true)
  })

  it('enforces text max lengths', () => {
    const result = SectionVisualSpecSchema.safeParse({
      sectionId: 'cta-newsletter',
      text: { headline: 'x'.repeat(81) },
    })
    expect(result.success).toBe(false)
  })

  it('accepts all 50 section IDs', () => {
    const ids = [
      'hero-fullbleed','hero-split','hero-centered','hero-video','hero-gradient','hero-editorial',
      'nav-topbar','nav-sidebar','nav-editorial','nav-mega',
      'grid-masonry','grid-bento','grid-magazine','grid-cards-3col',
      'grid-horizontal','grid-table','grid-image-overlay','grid-list-editorial',
      'detail-hero-overlay','detail-split-sidebar','detail-article','detail-data-dense','detail-gallery',
      'content-featured','content-testimonials-carousel','content-testimonials-wall',
      'content-stats','content-timeline','content-faq','content-features','content-team',
      'cta-newsletter','cta-newsletter-split','cta-pricing','cta-download','cta-contact',
      'footer-dark-photo','footer-minimal','footer-multi-column','footer-centered',
      'util-category-scroll','util-breadcrumb','util-search-header',
      'util-filter-tabs','util-empty-state','util-pagination',
      'domain-menu-archive','domain-menu-category','domain-reservation-form','domain-services-list',
    ]
    for (const id of ids) {
      expect(SectionVisualSpecSchema.safeParse({ sectionId: id }).success).toBe(true)
    }
  })
})

describe('PageCompositionPlanV2Schema', () => {
  it('accepts valid plan with globalNav and globalFooter', () => {
    const result = PageCompositionPlanV2Schema.safeParse({
      globalNav: 'nav-editorial',
      globalFooter: 'footer-multi-column',
      routes: [{
        path: '/',
        sections: [
          { sectionId: 'hero-fullbleed', background: 'dark-overlay', spacing: 'generous' },
          { sectionId: 'content-featured', entityBinding: 'recipes', background: 'default' },
          { sectionId: 'cta-newsletter', background: 'muted' },
        ],
      }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects plan with no routes', () => {
    expect(PageCompositionPlanV2Schema.safeParse({ routes: [] }).success).toBe(false)
  })

  it('rejects route with no sections', () => {
    expect(PageCompositionPlanV2Schema.safeParse({ routes: [{ path: '/', sections: [] }] }).success).toBe(false)
  })

  it('rejects route with >10 sections', () => {
    const sections = Array.from({ length: 11 }, () => ({ sectionId: 'content-stats' }))
    expect(PageCompositionPlanV2Schema.safeParse({ routes: [{ path: '/', sections }] }).success).toBe(false)
  })
})
