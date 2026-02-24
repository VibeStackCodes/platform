import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the lazy MessageResponse to avoid Streamdown/supabase deps in tests
vi.mock('@/components/ai-elements/message', () => ({
  MessageResponse: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

import { ThinkingCard } from '@/components/ai-elements/thinking-card'

describe('ThinkingCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows elapsed time while thinking', () => {
    render(<ThinkingCard startedAt={Date.now()} status="thinking" />)
    expect(screen.getByText(/thinking/i)).toBeInTheDocument()
  })

  it('shows final time and reasoning when complete', () => {
    render(
      <ThinkingCard startedAt={Date.now() - 12000} status="complete" durationMs={12000}>
        {"I'll build a clean todo app with warm tones."}
      </ThinkingCard>,
    )
    expect(screen.getByText('Thought for 12s')).toBeInTheDocument()
    expect(screen.getByText(/clean todo app/)).toBeInTheDocument()
  })

  it('renders structured features/design sections', () => {
    render(
      <ThinkingCard startedAt={Date.now() - 8000} status="complete" durationMs={8000}>
        {'**Features:** Add tasks, delete tasks\n**Design:** Warm stone palette'}
      </ThinkingCard>,
    )
    expect(screen.getByText(/Features:/)).toBeInTheDocument()
    expect(screen.getByText(/Design:/)).toBeInTheDocument()
  })
})
