import { describe, it, expect } from 'vitest'
import type {
  StreamEvent,
  DesignTokensEvent,
  ArchitectureReadyEvent,
  PageGeneratingEvent,
  PageCompleteEvent,
  FileAssembledEvent,
  ValidationCheckEvent,
  TimelineEntry,
} from '@/lib/types'

describe('new SSE event types', () => {
  it('DesignTokensEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = {
      type: 'design_tokens',
      tokens: {
        name: 'canape',
        colors: { background: '#fff', foreground: '#111', primary: '#2b6cb0', primaryForeground: '#fff', secondary: '#e5e7eb', accent: '#f59e0b', muted: '#f3f4f6', border: '#d1d5db' },
        fonts: { display: 'Playfair Display', body: 'Inter', googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter&family=Playfair+Display' },
        style: { borderRadius: '0.5rem', cardStyle: 'bordered', navStyle: 'top-bar', heroLayout: 'fullbleed', spacing: 'normal', motion: 'subtle', imagery: 'photography-heavy' },
        authPosture: 'public',
        textSlots: { hero_headline: 'Welcome', hero_subtext: 'A restaurant', about_paragraph: 'About us', cta_label: 'Reserve', empty_state: 'No items', footer_tagline: 'Built with care' },
      },
    }
    expect(event.type).toBe('design_tokens')
  })

  it('ArchitectureReadyEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = {
      type: 'architecture_ready',
      spec: {
        archetype: 'static',
        sitemap: [{ route: '/', componentName: 'Homepage', purpose: 'Landing page', sections: ['hero', 'grid'], dataRequirements: 'none' }],
        auth: { required: false },
      },
    }
    expect(event.type).toBe('architecture_ready')
  })

  it('PageGeneratingEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = { type: 'page_generating', fileName: 'index.tsx', route: '/', componentName: 'Homepage', pageIndex: 0, totalPages: 8 }
    expect(event.type).toBe('page_generating')
  })

  it('PageCompleteEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = { type: 'page_complete', fileName: 'index.tsx', route: '/', componentName: 'Homepage', lineCount: 142, code: '// first 50 lines', pageIndex: 0, totalPages: 8 }
    expect(event.type).toBe('page_complete')
  })

  it('FileAssembledEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = { type: 'file_assembled', path: 'vite.config.ts', category: 'config' }
    expect(event.type).toBe('file_assembled')
  })

  it('ValidationCheckEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = { type: 'validation_check', name: 'imports', status: 'passed' }
    expect(event.type).toBe('validation_check')
  })

  it('new TimelineEntry variants exist', () => {
    const entries: TimelineEntry[] = [
      { type: 'design_tokens', tokens: {} as any, ts: Date.now() },
      { type: 'architecture', spec: {} as any, ts: Date.now() },
      { type: 'page_progress', pages: [], ts: Date.now() },
      { type: 'file_assembly', files: [], ts: Date.now() },
      { type: 'validation', checks: [], ts: Date.now() },
    ]
    expect(entries).toHaveLength(5)
  })
})
