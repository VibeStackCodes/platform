export const oldComponentContent = `import { useState } from 'react'

interface ButtonProps {
  label: string
  onClick: () => void
}

export function Button({ label, onClick }: ButtonProps) {
  const [loading, setLoading] = useState(false)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
    >
      {label}
    </button>
  )
}`

export const newComponentContent = `import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps {
  label: string
  onClick: () => void | Promise<void>
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  className?: string
}

export function Button({ label, onClick, variant = 'primary', disabled = false, className }: ButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = useCallback(async () => {
    setLoading(true)
    try {
      await onClick()
    } finally {
      setLoading(false)
    }
  }, [onClick])

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={cn(
        'rounded-md px-4 py-2 text-sm font-medium transition-colors',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        variant === 'ghost' && 'hover:bg-accent hover:text-accent-foreground',
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {loading ? 'Loading...' : label}
    </button>
  )
}`

export const newFileContent = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}`
