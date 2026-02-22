import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArchitectureCard } from '@/components/ai-elements/architecture-card'

const mockSpec = {
  archetype: 'static',
  sitemap: [
    { route: '/', componentName: 'Homepage', purpose: 'Landing page', sections: ['hero-fullbleed', 'grid-card'], dataRequirements: 'none' },
    { route: '/menu/', componentName: 'MenuPage', purpose: 'Restaurant menu', sections: ['category-tabs', 'menu-grid'], dataRequirements: 'none' },
    { route: '/contact/', componentName: 'ContactPage', purpose: 'Contact form', sections: ['form', 'map'], dataRequirements: 'none' },
  ],
  auth: { required: false },
}

describe('ArchitectureCard', () => {
  it('renders archetype badge', () => {
    render(<ArchitectureCard spec={mockSpec} />)
    expect(screen.getByText('static')).toBeDefined()
  })

  it('renders page count', () => {
    render(<ArchitectureCard spec={mockSpec} />)
    expect(screen.getByText(/3 pages/)).toBeDefined()
  })

  it('renders all route paths', () => {
    render(<ArchitectureCard spec={mockSpec} />)
    expect(screen.getByText('/')).toBeDefined()
    expect(screen.getByText('/menu/')).toBeDefined()
    expect(screen.getByText('/contact/')).toBeDefined()
  })

  it('renders component names', () => {
    render(<ArchitectureCard spec={mockSpec} />)
    expect(screen.getByText('Homepage')).toBeDefined()
    expect(screen.getByText('MenuPage')).toBeDefined()
  })
})
