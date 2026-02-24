import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PropertyPanel } from '@/components/ai-elements/property-panel'
import type { ElementContext } from '@/lib/types'

const mockElement: ElementContext = {
  fileName: 'src/routes/index.tsx',
  lineNumber: 42,
  columnNumber: 0,
  tagName: 'button',
  className: 'bg-blue-500 text-white px-4 py-2',
  textContent: 'Click me',
  tailwindClasses: ['bg-blue-500', 'text-white', 'px-4', 'py-2'],
  rect: { x: 100, y: 200, width: 120, height: 40 },
}

describe('PropertyPanel', () => {
  it('renders with element info', () => {
    render(<PropertyPanel element={mockElement} onApply={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/button/i)).toBeInTheDocument()
    expect(screen.getByText(/index\.tsx:42/)).toBeInTheDocument()
  })

  it('shows text input pre-filled with element textContent', () => {
    render(<PropertyPanel element={mockElement} onApply={() => {}} onDismiss={() => {}} />)
    const input = screen.getByLabelText(/text/i) as HTMLInputElement
    expect(input.value).toBe('Click me')
  })

  it('calls onApply with diff description', () => {
    const onApply = vi.fn()
    render(<PropertyPanel element={mockElement} onApply={onApply} onDismiss={() => {}} />)
    const input = screen.getByLabelText(/text/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Submit' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(onApply).toHaveBeenCalledWith(expect.stringContaining('Submit'))
  })

  it('calls onDismiss when cancel is clicked', () => {
    const onDismiss = vi.fn()
    render(<PropertyPanel element={mockElement} onApply={() => {}} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('disables apply when nothing has changed', () => {
    render(<PropertyPanel element={mockElement} onApply={() => {}} onDismiss={() => {}} />)
    const applyBtn = screen.getByRole('button', { name: /apply/i })
    expect(applyBtn).toBeDisabled()
  })
})
