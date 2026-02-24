import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PromptBar } from '@/components/prompt-bar'

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

describe('PromptBar mode badges', () => {
  it('shows Edit mode active by default', () => {
    renderWithProviders(<PromptBar onSubmit={vi.fn()} />)

    const editBtn = screen.getByRole('button', { name: 'Edit' })
    expect(editBtn.getAttribute('data-active')).toBe('true')

    const chatBtn = screen.getByRole('button', { name: 'Chat' })
    expect(chatBtn.getAttribute('data-active')).toBeNull()

    const planBtn = screen.getByRole('button', { name: 'Plan' })
    expect(planBtn.getAttribute('data-active')).toBeNull()
  })

  it('activates Chat mode when Chat badge is clicked', () => {
    renderWithProviders(<PromptBar onSubmit={vi.fn()} />)

    const chatBtn = screen.getByRole('button', { name: 'Chat' })
    fireEvent.click(chatBtn)

    expect(chatBtn.getAttribute('data-active')).toBe('true')
    expect(screen.getByRole('button', { name: 'Edit' }).getAttribute('data-active')).toBeNull()
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('data-active')).toBeNull()
  })

  it('activates Plan mode when Plan badge is clicked', () => {
    renderWithProviders(<PromptBar onSubmit={vi.fn()} />)

    const planBtn = screen.getByRole('button', { name: 'Plan' })
    fireEvent.click(planBtn)

    expect(planBtn.getAttribute('data-active')).toBe('true')
    expect(screen.getByRole('button', { name: 'Edit' }).getAttribute('data-active')).toBeNull()
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('data-active')).toBeNull()
  })
})
