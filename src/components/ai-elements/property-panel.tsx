import { useState, useMemo } from 'react'
import { Paintbrush, Type, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ElementContext } from '@/lib/types'

interface PropertyPanelProps {
  element: ElementContext
  onApply: (editDescription: string) => void
  onDismiss: () => void
}

export function PropertyPanel({ element, onApply, onDismiss }: PropertyPanelProps) {
  const [text, setText] = useState(element.textContent)
  const [fontSize, setFontSize] = useState('')
  const [textColor, setTextColor] = useState('')
  const [bgColor, setBgColor] = useState('')
  const [textAlign, setTextAlign] = useState('')
  const [padding, setPadding] = useState('')

  const hasChanges = useMemo(() => {
    return (
      text !== element.textContent ||
      fontSize !== '' ||
      textColor !== '' ||
      bgColor !== '' ||
      textAlign !== '' ||
      padding !== ''
    )
  }, [text, fontSize, textColor, bgColor, textAlign, padding, element.textContent])

  const buildDiffDescription = () => {
    const parts: string[] = []
    if (text !== element.textContent) {
      parts.push(`Change text content to "${text}"`)
    }
    if (fontSize) parts.push(`Set font size to ${fontSize}`)
    if (textColor) parts.push(`Set text color to ${textColor}`)
    if (bgColor) parts.push(`Set background color to ${bgColor}`)
    if (textAlign) parts.push(`Set text alignment to ${textAlign}`)
    if (padding) parts.push(`Set padding to ${padding}`)
    return parts.join('. ') + '.'
  }

  const handleApply = () => {
    if (!hasChanges) return
    onApply(buildDiffDescription())
  }

  const fileName = element.fileName.split('/').pop() ?? element.fileName

  return (
    <div className="w-72 rounded-lg border bg-card shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Paintbrush className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">
            &lt;{element.tagName}&gt;
          </span>
          <span className="text-xs text-muted-foreground">
            {fileName}:{element.lineNumber}
          </span>
        </div>
        <button type="button" onClick={onDismiss} className="rounded p-0.5 hover:bg-muted">
          <X className="size-3.5" />
        </button>
      </div>

      {/* Properties */}
      <div className="space-y-3 p-3">
        {/* Text */}
        <div className="space-y-1">
          <Label htmlFor="prop-text" className="text-xs">
            <Type className="mr-1 inline size-3" />
            Text
          </Label>
          <Input
            id="prop-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-7 text-xs"
          />
        </div>

        {/* Font Size */}
        <div className="space-y-1">
          <Label htmlFor="prop-font-size" className="text-xs">Font Size</Label>
          <Input
            id="prop-font-size"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
            placeholder="e.g. text-lg, 18px"
            className="h-7 text-xs"
          />
        </div>

        {/* Colors - side by side */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="prop-text-color" className="text-xs">Color</Label>
            <Input
              id="prop-text-color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              placeholder="e.g. red-500"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="prop-bg-color" className="text-xs">Background</Label>
            <Input
              id="prop-bg-color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              placeholder="e.g. blue-100"
              className="h-7 text-xs"
            />
          </div>
        </div>

        {/* Text Align */}
        <div className="space-y-1">
          <Label className="text-xs">Text Align</Label>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => setTextAlign(textAlign === align ? '' : align)}
                className={`rounded px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  textAlign === align
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {align}
              </button>
            ))}
          </div>
        </div>

        {/* Padding */}
        <div className="space-y-1">
          <Label htmlFor="prop-padding" className="text-xs">Padding</Label>
          <Input
            id="prop-padding"
            value={padding}
            onChange={(e) => setPadding(e.target.value)}
            placeholder="e.g. p-4, px-6 py-2"
            className="h-7 text-xs"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onDismiss} className="h-7 text-xs">
          Cancel
        </Button>
        <Button size="sm" onClick={handleApply} disabled={!hasChanges} className="h-7 text-xs">
          Apply
        </Button>
      </div>
    </div>
  )
}
