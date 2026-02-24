import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { OperationSummaryCard } from '@/components/ai-elements/operation-summary-card'

describe('OperationSummaryCard', () => {
  const files = [
    { path: 'src/main.tsx', category: 'wiring' as const },
    { path: 'src/index.css', category: 'style' as const },
  ]
  const packages = ['framer-motion', '@supabase/supabase-js']

  it('shows summary line with file and package counts', () => {
    render(<OperationSummaryCard files={files} packages={packages} status="complete" />)
    expect(screen.getByText(/2 files/)).toBeInTheDocument()
    expect(screen.getByText(/2 packages/)).toBeInTheDocument()
  })

  it('expands to show installed packages and file list', () => {
    render(<OperationSummaryCard files={files} packages={packages} status="complete" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('framer-motion')).toBeInTheDocument()
    expect(screen.getByText('src/main.tsx')).toBeInTheDocument()
  })

  it('shows progress when running', () => {
    render(<OperationSummaryCard files={files} packages={[]} status="running" />)
    expect(screen.getByText(/assembling/i)).toBeInTheDocument()
  })
})
