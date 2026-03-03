import { useCallback, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { ChevronDown, ChevronRight, Loader2, X } from 'lucide-react'
import { apiFetch, cn } from '@/lib/utils'
import { useEditorStore } from '@/lib/editor-store'

// ── Types ─────────────────────────────────────────────────────────────

interface PropertyInspectorProps {
  projectId: string
  sandboxId: string
  onStylePreview?: (odid: string, styles: Record<string, string>) => void
  onClose?: () => void
}

// ── Sub-components ────────────────────────────────────────────────────

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
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="mt-1.5 w-full rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── CSS property → penpal applyStylePreview mapping ───────────────────
// Maps our prop keys to CSS property names understood by the preload script
const CSS_PROP_MAP: Record<string, string> = {
  display: 'display',
  flexDirection: 'flex-direction',
  gap: 'gap',
  margin: 'margin',
  padding: 'padding',
  width: 'width',
  height: 'height',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  textAlign: 'text-align',
  color: 'color',
  backgroundColor: 'background-color',
  borderWidth: 'border-width',
  borderRadius: 'border-radius',
  borderColor: 'border-color',
  opacity: 'opacity',
  boxShadow: 'box-shadow',
}

// ── Main component ────────────────────────────────────────────────────

export function PropertyInspector({
  projectId,
  sandboxId,
  onStylePreview,
  onClose,
}: PropertyInspectorProps) {
  const selectedElement = useEditorStore((s) => s.selectedElement)
  const setPatchInFlight = useEditorStore((s) => s.setPatchInFlight)
  const isPatchInFlight = useEditorStore((s) => s.isPatchInFlight)

  // Track local overrides so inputs are live without waiting for re-select
  const [localStyles, setLocalStyles] = useState<Record<string, string>>({})

  // Debounce timer ref for patch persistence
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const sendPatch = useCallback(
    async (oid: string, cssProp: string, value: string) => {
      setPatchInFlight(true)
      try {
        await apiFetch('/api/editor/patch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            sandboxId,
            edits: [
              {
                oid,
                type: 'style',
                prop: cssProp,
                value,
              },
            ],
          }),
        })
      } finally {
        setPatchInFlight(false)
      }
    },
    [projectId, sandboxId, setPatchInFlight],
  )

  const handleChange = useCallback(
    (prop: string) => (value: string) => {
      if (!selectedElement) return

      const cssProp = CSS_PROP_MAP[prop] ?? prop

      // 1. Update local state immediately for live input
      setLocalStyles((prev) => ({ ...prev, [prop]: value }))

      // 2. Instant visual preview in iframe
      onStylePreview?.(selectedElement.odid, { [cssProp]: value })

      // 3. Debounce the persist call (300ms)
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        sendPatch(selectedElement.oid, cssProp, value)
      }, 300)
    },
    [selectedElement, onStylePreview, sendPatch],
  )

  // Reset local overrides when selection changes
  const prevOidRef = useRef<string | null>(null)
  if (selectedElement?.oid !== prevOidRef.current) {
    prevOidRef.current = selectedElement?.oid ?? null
    // Clear local overrides synchronously during render — safe because it's a ref + state reset
    if (Object.keys(localStyles).length > 0) {
      // Can't call setState during render; schedule it
      Promise.resolve().then(() => setLocalStyles({}))
    }
  }

  if (!selectedElement) return null

  const { computedStyles, tailwindClasses, elementType, tagName } = selectedElement

  // Merge server-provided computedStyles with any pending local overrides
  const styles = { ...computedStyles, ...localStyles }

  return (
    <div
      className={cn(
        'absolute top-0 right-0 z-30 flex h-full w-[220px] flex-col border-l border-border bg-background shadow-xl',
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-400 shrink-0">
            {`<${tagName}>`}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{elementType}</span>
          {isPatchInFlight && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close inspector"
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
            value={styles.display ?? ''}
            onChange={handleChange('display')}
          />
          {styles.display === 'flex' && (
            <>
              <PropertyRow
                label="Direction"
                value={styles.flexDirection ?? ''}
                onChange={handleChange('flexDirection')}
              />
              <PropertyRow
                label="Gap"
                value={styles.gap ?? ''}
                onChange={handleChange('gap')}
              />
            </>
          )}
        </Section>

        {/* Spacing */}
        <Section title="Spacing">
          <BoxModelDiagram
            margin={styles.margin ?? '0px'}
            padding={styles.padding ?? '0px'}
          />
          <PropertyRow
            label="Margin"
            value={styles.margin ?? ''}
            onChange={handleChange('margin')}
          />
          <PropertyRow
            label="Padding"
            value={styles.padding ?? ''}
            onChange={handleChange('padding')}
          />
        </Section>

        {/* Size */}
        <Section title="Size">
          <PropertyRow
            label="Width"
            value={styles.width ?? ''}
            onChange={handleChange('width')}
          />
          <PropertyRow
            label="Height"
            value={styles.height ?? ''}
            onChange={handleChange('height')}
          />
        </Section>

        {/* Typography — text and button elements */}
        {(elementType === 'text' || elementType === 'button') && (
          <Section title="Typography">
            <PropertyRow
              label="Font Size"
              value={styles.fontSize ?? ''}
              onChange={handleChange('fontSize')}
            />
            <PropertyRow
              label="Weight"
              value={styles.fontWeight ?? ''}
              onChange={handleChange('fontWeight')}
            />
            <PropertyRow
              label="Align"
              value={styles.textAlign ?? ''}
              onChange={handleChange('textAlign')}
            />
            <ColorSwatch
              label="Color"
              value={styles.color ?? '#000000'}
              onChange={handleChange('color')}
            />
          </Section>
        )}

        {/* Background */}
        <Section title="Background">
          <ColorSwatch
            label="Color"
            value={styles.backgroundColor ?? 'transparent'}
            onChange={handleChange('backgroundColor')}
          />
        </Section>

        {/* Border */}
        <Section title="Border" defaultOpen={false}>
          <PropertyRow
            label="Width"
            value={styles.borderWidth ?? ''}
            onChange={handleChange('borderWidth')}
          />
          <PropertyRow
            label="Radius"
            value={styles.borderRadius ?? ''}
            onChange={handleChange('borderRadius')}
          />
          <ColorSwatch
            label="Color"
            value={styles.borderColor ?? '#000000'}
            onChange={handleChange('borderColor')}
          />
        </Section>

        {/* Effects */}
        <Section title="Effects" defaultOpen={false}>
          <PropertyRow
            label="Opacity"
            value={styles.opacity ?? ''}
            onChange={handleChange('opacity')}
          />
          <PropertyRow
            label="Shadow"
            value={styles.boxShadow ?? ''}
            onChange={handleChange('boxShadow')}
          />
        </Section>
      </div>
    </div>
  )
}
