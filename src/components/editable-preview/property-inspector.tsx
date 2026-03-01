import { useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import type { ElementInfo } from '@/hooks/use-element-interaction'

interface PropertyInspectorProps {
  element: ElementInfo
  onPropertyChange?: (elementId: string, prop: string, value: string) => void
  onClose?: () => void
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/50"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

function PropertyRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange?: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="min-w-0 flex-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
      />
    </div>
  )
}

function TailwindChips({ classes }: { classes: string[] }) {
  if (classes.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {classes.map((cls) => (
        <span
          key={cls}
          className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-400"
        >
          {cls}
        </span>
      ))}
    </div>
  )
}

function BoxModelDiagram({ margin, padding }: { margin: string; padding: string }) {
  // Parse shorthand values into [top, right, bottom, left]
  const parseShorthand = (val: string): [string, string, string, string] => {
    const parts = val.split(' ').filter(Boolean)
    if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]]
    if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]]
    if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]]
    return [parts[0] ?? '0', parts[1] ?? '0', parts[2] ?? '0', parts[3] ?? '0']
  }

  const m = parseShorthand(margin)
  const p = parseShorthand(padding)

  return (
    <div className="flex items-center justify-center py-2">
      {/* Margin box */}
      <div className="relative rounded border border-orange-400/40 bg-orange-400/5 px-4 py-3">
        <span className="absolute top-0.5 left-1 text-[8px] text-orange-400/60">margin</span>
        <span className="absolute top-3 left-1/2 -translate-x-1/2 text-[9px] text-orange-400/80">
          {m[0]}
        </span>
        <span className="absolute top-1/2 right-1 -translate-y-1/2 text-[9px] text-orange-400/80">
          {m[1]}
        </span>
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] text-orange-400/80">
          {m[2]}
        </span>
        <span className="absolute top-1/2 left-1 -translate-y-1/2 text-[9px] text-orange-400/80">
          {m[3]}
        </span>
        {/* Padding box */}
        <div className="relative rounded border border-green-400/40 bg-green-400/5 px-5 py-4">
          <span className="absolute top-0.5 left-1 text-[8px] text-green-400/60">padding</span>
          <span className="absolute top-3 left-1/2 -translate-x-1/2 text-[9px] text-green-400/80">
            {p[0]}
          </span>
          <span className="absolute top-1/2 right-1 -translate-y-1/2 text-[9px] text-green-400/80">
            {p[1]}
          </span>
          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] text-green-400/80">
            {p[2]}
          </span>
          <span className="absolute top-1/2 left-1 -translate-y-1/2 text-[9px] text-green-400/80">
            {p[3]}
          </span>
          {/* Content box */}
          <div className="rounded border border-blue-400/40 bg-blue-400/5 px-4 py-2 text-center text-[9px] text-blue-400/80">
            content
          </div>
        </div>
      </div>
    </div>
  )
}

function ColorSwatch({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange?: (value: string) => void
}) {
  const [showPicker, setShowPicker] = useState(false)

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="relative flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="size-5 rounded border border-border"
          style={{ backgroundColor: value }}
        />
        <span className="font-mono text-[10px] text-muted-foreground">{value}</span>
        {showPicker && (
          <div className="absolute top-6 left-0 z-50 rounded-lg border bg-background p-2 shadow-lg">
            <HexColorPicker color={value} onChange={(c) => onChange?.(c)} />
          </div>
        )}
      </div>
    </div>
  )
}

export function PropertyInspector({ element, onPropertyChange, onClose }: PropertyInspectorProps) {
  const { computedStyles, tailwindClasses, elementType, tagName, elementId } = element

  const handleChange = (prop: string) => (value: string) => {
    onPropertyChange?.(elementId, prop, value)
  }

  return (
    <div className="flex h-full w-[220px] shrink-0 flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-400">
            {`<${tagName}>`}
          </span>
          <span className="text-[11px] text-muted-foreground">{elementType}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Tailwind classes */}
        {tailwindClasses.length > 0 && (
          <Section title="Classes">
            <TailwindChips classes={tailwindClasses} />
          </Section>
        )}

        {/* Layout */}
        <Section title="Layout">
          <PropertyRow
            label="Display"
            value={computedStyles.display}
            onChange={handleChange('display')}
          />
          {computedStyles.display === 'flex' && (
            <>
              <PropertyRow
                label="Direction"
                value={computedStyles.flexDirection}
                onChange={handleChange('flexDirection')}
              />
              <PropertyRow label="Gap" value={computedStyles.gap} onChange={handleChange('gap')} />
            </>
          )}
        </Section>

        {/* Spacing */}
        <Section title="Spacing">
          <BoxModelDiagram margin={computedStyles.margin} padding={computedStyles.padding} />
          <PropertyRow
            label="Margin"
            value={computedStyles.margin}
            onChange={handleChange('margin')}
          />
          <PropertyRow
            label="Padding"
            value={computedStyles.padding}
            onChange={handleChange('padding')}
          />
        </Section>

        {/* Size */}
        <Section title="Size">
          <PropertyRow
            label="Width"
            value={computedStyles.width}
            onChange={handleChange('width')}
          />
          <PropertyRow
            label="Height"
            value={computedStyles.height}
            onChange={handleChange('height')}
          />
        </Section>

        {/* Typography — text elements only */}
        {elementType === 'text' && (
          <Section title="Typography">
            <PropertyRow
              label="Font Size"
              value={computedStyles.fontSize}
              onChange={handleChange('fontSize')}
            />
            <PropertyRow
              label="Weight"
              value={computedStyles.fontWeight}
              onChange={handleChange('fontWeight')}
            />
            <PropertyRow
              label="Align"
              value={computedStyles.textAlign}
              onChange={handleChange('textAlign')}
            />
            <ColorSwatch
              label="Color"
              value={computedStyles.color}
              onChange={handleChange('color')}
            />
          </Section>
        )}

        {/* Background */}
        <Section title="Background">
          <ColorSwatch
            label="Color"
            value={computedStyles.backgroundColor}
            onChange={handleChange('backgroundColor')}
          />
        </Section>

        {/* Border */}
        <Section title="Border" defaultOpen={false}>
          <PropertyRow
            label="Width"
            value={computedStyles.borderWidth}
            onChange={handleChange('borderWidth')}
          />
          <PropertyRow
            label="Radius"
            value={computedStyles.borderRadius}
            onChange={handleChange('borderRadius')}
          />
          <ColorSwatch
            label="Color"
            value={computedStyles.borderColor}
            onChange={handleChange('borderColor')}
          />
        </Section>

        {/* Effects */}
        <Section title="Effects" defaultOpen={false}>
          <PropertyRow
            label="Opacity"
            value={computedStyles.opacity}
            onChange={handleChange('opacity')}
          />
          <PropertyRow
            label="Shadow"
            value={computedStyles.boxShadow}
            onChange={handleChange('boxShadow')}
          />
        </Section>
      </div>
    </div>
  )
}
