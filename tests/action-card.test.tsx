import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import {
  ActionCard,
  ActionCardHeader,
  ActionCardSummary,
  ActionCardTabs,
  ActionCardContent,
} from '@/components/ai-elements/action-card'

describe('ActionCard', () => {
  it('renders collapsed with summary line', () => {
    render(
      <ActionCard>
        <ActionCardHeader icon="sparkles" label="Designed architecture" status="complete" durationMs={4200} />
        <ActionCardSummary>8 pages, kanban archetype</ActionCardSummary>
        <ActionCardTabs>
          <ActionCardContent tab="details">Detail content</ActionCardContent>
          <ActionCardContent tab="preview">Preview content</ActionCardContent>
        </ActionCardTabs>
      </ActionCard>,
    )
    expect(screen.getByText('Designed architecture')).toBeInTheDocument()
    expect(screen.getByText('8 pages, kanban archetype')).toBeInTheDocument()
    expect(screen.queryByText('Detail content')).not.toBeInTheDocument()
  })

  it('expands to show Details tab on click', () => {
    render(
      <ActionCard>
        <ActionCardHeader icon="sparkles" label="Designed architecture" status="complete" durationMs={4200} />
        <ActionCardTabs>
          <ActionCardContent tab="details">Detail content</ActionCardContent>
          <ActionCardContent tab="preview">Preview content</ActionCardContent>
        </ActionCardTabs>
      </ActionCard>,
    )
    fireEvent.click(screen.getByRole('button', { name: /designed architecture/i }))
    expect(screen.getByText('Detail content')).toBeInTheDocument()
  })

  it('shows spinner when status is running', () => {
    render(
      <ActionCard>
        <ActionCardHeader icon="sparkles" label="Generating pages" status="running" elapsedMs={3000} />
      </ActionCard>,
    )
    expect(screen.getByText('Generating pages')).toBeInTheDocument()
    expect(screen.getByText('3.0s')).toBeInTheDocument()
  })
})
