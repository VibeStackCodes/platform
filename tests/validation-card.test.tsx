import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ValidationCard } from '@/components/ai-elements/validation-card'

const mockChecks = [
  { name: 'imports', status: 'passed' as const },
  { name: 'links', status: 'failed' as const, errors: [{ file: 'src/routes/blog/$slug.tsx', line: 42, message: 'Link "/authors/$id" has no matching route', type: 'broken_link' }] },
  { name: 'typescript', status: 'passed' as const },
  { name: 'build', status: 'running' as const },
]

describe('ValidationCard', () => {
  it('renders check names', () => {
    render(<ValidationCard checks={mockChecks} />)
    expect(screen.getByText('imports')).toBeDefined()
    expect(screen.getByText('links')).toBeDefined()
    expect(screen.getByText('typescript')).toBeDefined()
    expect(screen.getByText('build')).toBeDefined()
  })

  it('renders summary counts', () => {
    render(<ValidationCard checks={mockChecks} />)
    expect(screen.getByText(/2 passed/)).toBeDefined()
    expect(screen.getByText(/1 failed/)).toBeDefined()
  })

  it('renders error details for failed checks', () => {
    render(<ValidationCard checks={mockChecks} />)
    expect(screen.getByText(/no matching route/)).toBeDefined()
  })
})
