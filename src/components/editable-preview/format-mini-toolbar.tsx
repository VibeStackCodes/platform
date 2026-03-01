import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react'
import { useEffect } from 'react'
import { Bold, Italic, Link, Palette } from 'lucide-react'
import type { ElementInfo } from '@/hooks/use-element-interaction'

interface FormatMiniToolbarProps {
  element: ElementInfo
  onFormat?: (format: string) => void
}

export function FormatMiniToolbar({ element, onFormat }: FormatMiniToolbarProps) {
  const { refs, floatingStyles } = useFloating({
    placement: 'top',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })

  useEffect(() => {
    refs.setReference(element.element)
  }, [element.element, refs])

  const formats = [
    { icon: Bold, label: 'Bold', command: 'bold' },
    { icon: Italic, label: 'Italic', command: 'italic' },
    { icon: Link, label: 'Link', command: 'link' },
    { icon: Palette, label: 'Color', command: 'color' },
  ]

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-50 flex items-center gap-0.5 rounded-lg border border-border bg-background px-1 py-1 shadow-lg"
    >
      {formats.map((fmt) => {
        const Icon = fmt.icon
        return (
          <button
            key={fmt.command}
            type="button"
            onClick={() => onFormat?.(fmt.command)}
            className="flex items-center rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={fmt.label}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
