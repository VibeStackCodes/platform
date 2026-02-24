import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PlanApprovalCard } from '@/components/ai-elements/plan-approval-card'

describe('PlanApprovalCard', () => {
  const plan = {
    appName: 'TaskFlow',
    appDescription: 'A task management app',
    prd: '## Features\n- Kanban board\n- User auth',
  }

  it('renders plan details with app name and PRD', () => {
    render(<PlanApprovalCard plan={plan} onApprove={() => {}} status="pending" />)
    // App name appears in the header label
    expect(screen.getByText(/TaskFlow/)).toBeInTheDocument()
    // Expand the card to reveal tab content
    fireEvent.click(screen.getByRole('button', { name: /Review plan — TaskFlow/i }))
    // appDescription is rendered as plain text (not through Streamdown)
    expect(screen.getByText('A task management app')).toBeInTheDocument()
  })

  it('shows approve button when status is pending', () => {
    render(<PlanApprovalCard plan={plan} onApprove={() => {}} status="pending" />)
    // Expand the card
    fireEvent.click(screen.getByRole('button', { name: /Review plan — TaskFlow/i }))
    expect(screen.getByRole('button', { name: /Approve & Generate/i })).toBeInTheDocument()
  })

  it('calls onApprove when approve button is clicked', () => {
    const onApprove = vi.fn()
    render(<PlanApprovalCard plan={plan} onApprove={onApprove} status="pending" />)
    // Expand the card
    fireEvent.click(screen.getByRole('button', { name: /Review plan — TaskFlow/i }))
    fireEvent.click(screen.getByRole('button', { name: /Approve & Generate/i }))
    expect(onApprove).toHaveBeenCalledOnce()
  })

  it('hides approve button when status is approved', () => {
    render(<PlanApprovalCard plan={plan} onApprove={() => {}} status="approved" />)
    // Expand the card
    fireEvent.click(screen.getByRole('button', { name: /Plan approved — TaskFlow/i }))
    expect(screen.queryByRole('button', { name: /Approve & Generate/i })).not.toBeInTheDocument()
  })
})

describe('PlanApprovalCard integration', () => {
  it('renders with plan data from SSE event', () => {
    const plan = {
      appName: 'MyApp',
      appDescription: 'A cool app',
      prd: '## Plan\n- Feature 1\n- Feature 2',
    }
    render(<PlanApprovalCard plan={plan} onApprove={() => {}} status="pending" />)
    expect(screen.getByText(/MyApp/)).toBeInTheDocument()
    // Expand to see tab content
    fireEvent.click(screen.getByRole('button', { name: /Review plan — MyApp/i }))
    expect(screen.getByText('A cool app')).toBeInTheDocument()
  })
})
