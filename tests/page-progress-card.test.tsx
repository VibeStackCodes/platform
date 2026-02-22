import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageProgressCard } from '@/components/ai-elements/page-progress-card'

const mockPages = [
  { fileName: 'index.tsx', route: '/', componentName: 'Homepage', status: 'complete' as const, lineCount: 142, code: '// code preview' },
  { fileName: 'menu/index.tsx', route: '/menu/', componentName: 'MenuPage', status: 'generating' as const },
  { fileName: 'contact.tsx', route: '/contact/', componentName: 'ContactPage', status: 'pending' as const },
]

describe('PageProgressCard', () => {
  it('renders progress fraction', () => {
    render(<PageProgressCard pages={mockPages} />)
    expect(screen.getByText(/1\/3/)).toBeDefined()
  })

  it('renders each file name', () => {
    render(<PageProgressCard pages={mockPages} />)
    expect(screen.getByText('index.tsx')).toBeDefined()
    expect(screen.getByText('menu/index.tsx')).toBeDefined()
    expect(screen.getByText('contact.tsx')).toBeDefined()
  })

  it('shows line count for complete files', () => {
    render(<PageProgressCard pages={mockPages} />)
    expect(screen.getByText(/142/)).toBeDefined()
  })
})
