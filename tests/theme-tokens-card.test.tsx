import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeTokensCard } from '@/components/ai-elements/theme-tokens-card'

const mockTokens = {
  name: 'canape',
  colors: { background: '#ffffff', foreground: '#111111', primary: '#2b6cb0', primaryForeground: '#ffffff', secondary: '#e5e7eb', accent: '#f59e0b', muted: '#f3f4f6', border: '#d1d5db' },
  fonts: { display: 'Playfair Display', body: 'Inter', googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter&family=Playfair+Display' },
  style: { borderRadius: '0.5rem', cardStyle: 'bordered' as const, navStyle: 'top-bar' as const, heroLayout: 'fullbleed' as const, spacing: 'normal' as const, motion: 'subtle' as const, imagery: 'photography-heavy' as const },
  authPosture: 'public' as const,
  textSlots: { hero_headline: 'Welcome', hero_subtext: 'Test', about_paragraph: 'About', cta_label: 'CTA', empty_state: 'Empty', footer_tagline: 'Footer' },
}

describe('ThemeTokensCard', () => {
  it('renders theme name', () => {
    render(<ThemeTokensCard tokens={mockTokens} />)
    expect(screen.getByText('canape')).toBeDefined()
  })

  it('renders 8 color swatches', () => {
    const { container } = render(<ThemeTokensCard tokens={mockTokens} />)
    const swatches = container.querySelectorAll('[data-testid^="swatch-"]')
    expect(swatches.length).toBe(8)
  })

  it('renders font names', () => {
    render(<ThemeTokensCard tokens={mockTokens} />)
    expect(screen.getByText(/Playfair Display/)).toBeDefined()
    expect(screen.getByText(/Inter/)).toBeDefined()
  })

  it('renders style chips', () => {
    render(<ThemeTokensCard tokens={mockTokens} />)
    expect(screen.getByText('bordered')).toBeDefined()
    expect(screen.getByText('top-bar')).toBeDefined()
    expect(screen.getByText('fullbleed')).toBeDefined()
  })
})
