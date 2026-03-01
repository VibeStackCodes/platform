import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react'
import { useEffect } from 'react'
import {
  Sparkles,
  Type,
  Palette,
  AlignLeft,
  Image,
  Link,
  Crop,
  Layout,
  Square,
  Trash2,
  Copy,
  Search,
} from 'lucide-react'
import type { ElementInfo } from '@/hooks/use-element-interaction'

interface ContextualToolbarProps {
  element: ElementInfo
  onAskAI?: () => void
  onAction?: (action: string) => void
}

interface ToolbarAction {
  icon: React.ComponentType<{ className?: string }>
  label: string
  action: string
}

function getActionsForElement(elementType: ElementInfo['elementType']): ToolbarAction[] {
  switch (elementType) {
    case 'text':
      return [
        { icon: Sparkles, label: 'Ask AI', action: 'ask-ai' },
        { icon: Type, label: 'Edit Text', action: 'edit-text' },
        { icon: Type, label: 'Font', action: 'font' },
        { icon: Palette, label: 'Color', action: 'color' },
        { icon: AlignLeft, label: 'Align', action: 'align' },
      ]
    case 'image':
      return [
        { icon: Sparkles, label: 'Ask AI', action: 'ask-ai' },
        { icon: Image, label: 'Replace', action: 'replace-image' },
        { icon: Link, label: 'Link', action: 'link' },
        { icon: Crop, label: 'Crop', action: 'crop' },
      ]
    case 'button':
      return [
        { icon: Sparkles, label: 'Ask AI', action: 'ask-ai' },
        { icon: Type, label: 'Edit Label', action: 'edit-text' },
        { icon: Link, label: 'Link', action: 'link' },
        { icon: Palette, label: 'Style', action: 'style-variant' },
      ]
    case 'container':
      return [
        { icon: Sparkles, label: 'Ask AI', action: 'ask-ai' },
        { icon: Layout, label: 'Layout', action: 'layout' },
        { icon: Square, label: 'Padding', action: 'padding' },
        { icon: Palette, label: 'Background', action: 'background' },
      ]
    default:
      return [
        { icon: Sparkles, label: 'Ask AI', action: 'ask-ai' },
        { icon: Search, label: 'Inspect', action: 'inspect' },
        { icon: Copy, label: 'Copy', action: 'copy' },
        { icon: Trash2, label: 'Delete', action: 'delete' },
      ]
  }
}

export function ContextualToolbar({ element, onAskAI, onAction }: ContextualToolbarProps) {
  const { refs, floatingStyles } = useFloating({
    placement: 'top',
    middleware: [
      offset(8),
      flip({ fallbackPlacements: ['bottom', 'top-start', 'bottom-start'] }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  })

  useEffect(() => {
    refs.setReference(element.element)
  }, [element.element, refs])

  const actions = getActionsForElement(element.elementType)

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-50 flex items-center gap-0.5 rounded-lg border border-border bg-background px-1 py-1 shadow-lg"
    >
      {actions.map((action) => {
        const Icon = action.icon
        const isAskAI = action.action === 'ask-ai'
        return (
          <button
            key={action.action}
            type="button"
            onClick={() => {
              if (isAskAI) onAskAI?.()
              else onAction?.(action.action)
            }}
            className={
              isAskAI
                ? 'flex items-center gap-1.5 rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700'
                : 'flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
            }
            title={action.label}
          >
            <Icon className="h-3.5 w-3.5" />
            {isAskAI && <span>Ask AI</span>}
          </button>
        )
      })}
    </div>
  )
}
