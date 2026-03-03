import { useCallback, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CornerUpLeft,
  Loader2,
  Send,
  Sparkles,
  Upload,
} from 'lucide-react'
import { apiFetch, cn } from '@/lib/utils'
import { useEditorStore } from '@/lib/editor-store'

// ── Inlined types (mirrors gesture-screen.tsx to avoid circular deps) ─────────

interface SerializedRect {
  x: number
  y: number
  width: number
  height: number
}

interface EditorElementInfo {
  oid: string
  odid: string
  tagName: string
  textContent: string
  rect: SerializedRect
  tailwindClasses: string[]
  computedStyles: Record<string, string>
  elementType: 'text' | 'image' | 'button' | 'container'
  isEditable: boolean
  imageSrc?: string
  parentOid?: string
}

interface PreloadChildMethods {
  getElementAtPoint(x: number, y: number): EditorElementInfo | null
  startTextEditing(oid: string): void
  stopTextEditing(): { oid: string; newText: string } | null
  applyStylePreview?(odid: string, styles: Record<string, string>): void
  getElementByOid?(oid: string): EditorElementInfo | null
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface EditorSidebarProps {
  projectId: string
  sandboxId?: string
  child: unknown
  onBackToChat: () => void
  onSubmitPrompt?: (text: string, displayText?: string) => void
}

// ── Dropdown presets ───────────────────────────────────────────────────────────

const BORDER_WIDTHS = ['none', '1px', '2px', '4px', '8px']
const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted', 'double']
const BORDER_RADII = ['none', '0.125rem', '0.25rem', '0.375rem', '0.5rem', '0.75rem', '1rem', '9999px']
const SHADOWS = ['none', 'sm', 'md', 'lg', 'xl', '2xl']
const FONT_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900']
const TEXT_ALIGNS = ['left', 'center', 'right', 'justify']
const DISPLAYS = ['block', 'flex', 'grid', 'inline', 'inline-flex', 'inline-block', 'none']
const OBJECT_FITS = ['cover', 'contain', 'fill', 'none', 'scale-down']
const OPACITIES = ['100%', '90%', '80%', '70%', '60%', '50%', '40%', '30%', '20%', '10%', '0%']

// ── CSS property map ───────────────────────────────────────────────────────────

const CSS_PROP_MAP: Record<string, string> = {
  display: 'display',
  flexDirection: 'flex-direction',
  gap: 'gap',
  marginTop: 'margin-top',
  marginRight: 'margin-right',
  marginBottom: 'margin-bottom',
  marginLeft: 'margin-left',
  paddingTop: 'padding-top',
  paddingRight: 'padding-right',
  paddingBottom: 'padding-bottom',
  paddingLeft: 'padding-left',
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
  borderStyle: 'border-style',
  opacity: 'opacity',
  boxShadow: 'box-shadow',
  objectFit: 'object-fit',
}

// ── Section wrapper ────────────────────────────────────────────────────────────

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
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        {title}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

// ── Property row (text input) ──────────────────────────────────────────────────

function PropertyRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange?: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
      />
    </div>
  )
}

// ── Property row (select/dropdown) ────────────────────────────────────────────

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange?: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="min-w-0 flex-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
      >
        {!options.includes(value) && value && (
          <option value={value}>{value}</option>
        )}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Color swatch with picker ───────────────────────────────────────────────────

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange?: (value: string) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const isInherit = !value || value === 'inherit' || value === 'transparent'

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="relative flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className={cn(
            'size-5 rounded border border-border',
            isInherit && 'bg-[repeating-linear-gradient(45deg,oklch(0.7_0_0)_0px,oklch(0.7_0_0)_2px,transparent_2px,transparent_6px)]',
          )}
          style={!isInherit ? { backgroundColor: value } : undefined}
          aria-label={`Pick ${label} color`}
        />
        <span className="font-mono text-[10px] text-muted-foreground">{value || 'inherit'}</span>
        <button
          type="button"
          onClick={() => onChange?.('inherit')}
          className="rounded px-1 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Set to inherit"
        >
          Inherit
        </button>
        {showPicker && (
          <div className="absolute top-7 left-0 z-50 rounded-lg border border-border bg-background p-2 shadow-lg">
            <HexColorPicker
              color={isInherit ? '#000000' : value}
              onChange={(c) => onChange?.(c)}
            />
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

// ── Spacing per-side inputs ───────────────────────────────────────────────────

const SIDE_ICONS: Record<string, string> = {
  Top: '↑',
  Right: '→',
  Bottom: '↓',
  Left: '←',
}

function SpacingInputGroup({
  label,
  propPrefix,
  styles,
  onChange,
}: {
  label: string
  propPrefix: string
  styles: Record<string, string>
  onChange: (prop: string) => (value: string) => void
}) {
  const sides = ['Top', 'Right', 'Bottom', 'Left'] as const
  return (
    <div className="mb-1.5">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {sides.map((side) => {
          const key = `${propPrefix}${side}`
          return (
            <div key={side} className="flex items-center gap-1">
              <span className="w-3 shrink-0 text-center text-[10px] text-muted-foreground">
                {SIDE_ICONS[side]}
              </span>
              <input
                type="text"
                value={styles[key] ?? ''}
                onChange={(e) => onChange(key)(e.target.value)}
                placeholder="0px"
                className="min-w-0 flex-1 rounded border border-border bg-muted/30 px-1 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Box model diagram ─────────────────────────────────────────────────────────

function BoxModelDiagram({ styles }: { styles: Record<string, string> }) {
  const mt = styles.marginTop ?? '0'
  const mr = styles.marginRight ?? '0'
  const mb = styles.marginBottom ?? '0'
  const ml = styles.marginLeft ?? '0'
  const pt = styles.paddingTop ?? '0'
  const pr = styles.paddingRight ?? '0'
  const pb = styles.paddingBottom ?? '0'
  const pl = styles.paddingLeft ?? '0'

  return (
    <div className="mb-2 flex items-center justify-center py-2">
      {/* Margin box */}
      <div className="relative rounded border border-orange-400/40 bg-orange-400/5 px-6 py-4">
        <span className="absolute top-0.5 left-1 text-[8px] text-orange-400/50">margin</span>
        <span className="absolute top-1 left-1/2 -translate-x-1/2 font-mono text-[9px] text-orange-400/80">{mt}</span>
        <span className="absolute top-1/2 right-1 -translate-y-1/2 font-mono text-[9px] text-orange-400/80">{mr}</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[9px] text-orange-400/80">{mb}</span>
        <span className="absolute top-1/2 left-1 -translate-y-1/2 font-mono text-[9px] text-orange-400/80">{ml}</span>
        {/* Padding box */}
        <div className="relative rounded border border-green-400/40 bg-green-400/5 px-5 py-3">
          <span className="absolute top-0.5 left-1 text-[8px] text-green-400/50">padding</span>
          <span className="absolute top-1 left-1/2 -translate-x-1/2 font-mono text-[9px] text-green-400/80">{pt}</span>
          <span className="absolute top-1/2 right-1 -translate-y-1/2 font-mono text-[9px] text-green-400/80">{pr}</span>
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[9px] text-green-400/80">{pb}</span>
          <span className="absolute top-1/2 left-1 -translate-y-1/2 font-mono text-[9px] text-green-400/80">{pl}</span>
          {/* Content box */}
          <div className="rounded border border-blue-400/40 bg-blue-400/5 px-4 py-1.5 text-center font-mono text-[9px] text-blue-400/80">
            content
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tailwind class chips ───────────────────────────────────────────────────────

function TailwindChips({ classes }: { classes: string[] }) {
  if (classes.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground/60 italic">No Tailwind classes detected</p>
    )
  }
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

// ── Main EditorSidebar ─────────────────────────────────────────────────────────

export function EditorSidebar({ projectId, sandboxId, child: rawChild, onBackToChat, onSubmitPrompt }: EditorSidebarProps) {
  const child = rawChild as PreloadChildMethods | null
  const selectedElement = useEditorStore((s) => s.selectedElement)
  const isPatchInFlight = useEditorStore((s) => s.isPatchInFlight)
  const setPatchInFlight = useEditorStore((s) => s.setPatchInFlight)
  const undo = useEditorStore((s) => s.undo)
  const undoStack = useEditorStore((s) => s.undoStack)

  const [localStyles, setLocalStyles] = useState<Record<string, string>>({})
  const [promptValue, setPromptValue] = useState('')
  const [imageEditPrompt, setImageEditPrompt] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevOidRef = useRef<string | null>(null)

  // Reset local style overrides when element selection changes
  if (selectedElement?.oid !== prevOidRef.current) {
    prevOidRef.current = selectedElement?.oid ?? null
    if (Object.keys(localStyles).length > 0) {
      Promise.resolve().then(() => setLocalStyles({}))
    }
  }

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
            edits: [{ oid, type: 'style', prop: cssProp, value }],
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
      setLocalStyles((prev) => ({ ...prev, [prop]: value }))
      child?.applyStylePreview?.(selectedElement.odid, { [cssProp]: value })
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        sendPatch(selectedElement.oid, cssProp, value)
      }, 300)
    },
    [selectedElement, child, sendPatch],
  )

  const handleSelectParent = useCallback(async () => {
    if (!selectedElement?.parentOid || !child) return
    const parentInfo = await child.getElementByOid?.(selectedElement.parentOid)
    if (parentInfo) {
      useEditorStore.getState().setSelectedElement(parentInfo)
    }
  }, [selectedElement, child])

  const handleUndo = useCallback(() => {
    undo()
  }, [undo])

  const handleImageReplace = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !selectedElement) return
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', projectId)
      if (sandboxId) formData.append('sandboxId', sandboxId)
      formData.append('oid', selectedElement.oid)
      setPatchInFlight(true)
      try {
        await apiFetch('/api/editor/patch/image', { method: 'POST', body: formData })
      } finally {
        setPatchInFlight(false)
        // Reset file input so same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [selectedElement, projectId, sandboxId, setPatchInFlight],
  )

  const handlePromptSend = useCallback(() => {
    if (!promptValue.trim()) return
    const userText = promptValue.trim()
    const context = selectedElement
      ? `[Editing ${selectedElement.tagName} element (oid: ${selectedElement.oid})]\n\n`
      : ''
    onSubmitPrompt?.(context + userText, userText)
    setPromptValue('')
    onBackToChat()
  }, [promptValue, selectedElement, onSubmitPrompt, onBackToChat])

  const isImage = selectedElement?.elementType === 'image'
  const isTypographic = selectedElement?.elementType === 'text' || selectedElement?.elementType === 'button'
  const styles = selectedElement
    ? { ...selectedElement.computedStyles, ...localStyles }
    : {}

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-background">
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-1 border-b border-border px-3 py-2">
        {/* Top row: back + breadcrumb + actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToChat}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>
          <span className="text-[11px] text-muted-foreground/40">/</span>
          <span className="text-[11px] font-medium text-foreground">Design</span>
          <span className="text-[11px] text-muted-foreground/40">/</span>
          <span className="text-[11px] text-muted-foreground">Visual edits</span>
          {isPatchInFlight && (
            <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Second row: select parent + undo */}
        {selectedElement && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSelectParent}
              disabled={!selectedElement.parentOid}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title="Select parent element"
            >
              <ChevronUp className="h-3 w-3" />
              Select parent
            </button>
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title="Undo last change"
            >
              <CornerUpLeft className="h-3 w-3" />
              Undo
            </button>
          </div>
        )}
      </div>

      {/* ── Body (scrollable) ───────────────────────────────────────── */}
      {!selectedElement ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-[13px] text-muted-foreground">Click any element in the preview to inspect it.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Image section */}
          {isImage && (
            <Section title="Image">
              {selectedElement.imageSrc && (
                <div className="mb-2 overflow-hidden rounded border border-border">
                  <img
                    src={selectedElement.imageSrc}
                    alt="Selected element"
                    className="h-28 w-full object-cover"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleImageReplace}
                className="mb-2 flex w-full items-center justify-center gap-1.5 rounded border border-border bg-muted/30 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Upload className="h-3 w-3" />
                Replace image
              </button>
              <div className="mt-1">
                <span className="mb-1 block text-[11px] text-muted-foreground">
                  Edit with VibeStack
                </span>
                <textarea
                  value={imageEditPrompt}
                  onChange={(e) => setImageEditPrompt(e.target.value)}
                  placeholder="Describe the image you want to generate..."
                  rows={3}
                  className="w-full rounded border border-border bg-muted/30 px-2 py-1.5 font-sans text-[11px] text-foreground outline-none resize-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded bg-blue-500 py-1.5 text-[11px] font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  disabled={!imageEditPrompt.trim()}
                >
                  <Sparkles className="h-3 w-3" />
                  Generate
                </button>
              </div>
            </Section>
          )}

          {/* Tailwind classes */}
          <Section title="Classes">
            <TailwindChips classes={selectedElement.tailwindClasses} />
          </Section>

          {/* Colors (non-image only) */}
          {!isImage && (
            <Section title="Colors">
              <ColorRow
                label="Text"
                value={styles.color ?? ''}
                onChange={handleChange('color')}
              />
              <ColorRow
                label="Background"
                value={styles.backgroundColor ?? ''}
                onChange={handleChange('backgroundColor')}
              />
            </Section>
          )}

          {/* Spacing (non-image only) */}
          {!isImage && (
            <Section title="Spacing">
              <BoxModelDiagram styles={styles} />
              <SpacingInputGroup
                label="Margin"
                propPrefix="margin"
                styles={styles}
                onChange={handleChange}
              />
              <SpacingInputGroup
                label="Padding"
                propPrefix="padding"
                styles={styles}
                onChange={handleChange}
              />
            </Section>
          )}

          {/* Layout */}
          <Section title="Layout">
            {isImage ? (
              <SelectRow
                label="Object Fit"
                value={styles.objectFit ?? 'cover'}
                options={OBJECT_FITS}
                onChange={handleChange('objectFit')}
              />
            ) : (
              <SelectRow
                label="Display"
                value={styles.display ?? 'block'}
                options={DISPLAYS}
                onChange={handleChange('display')}
              />
            )}
          </Section>

          {/* Size */}
          <Section title="Size">
            <PropertyRow
              label="Width"
              value={styles.width ?? ''}
              onChange={handleChange('width')}
              placeholder="auto"
            />
            <PropertyRow
              label="Height"
              value={styles.height ?? ''}
              onChange={handleChange('height')}
              placeholder="auto"
            />
          </Section>

          {/* Typography (text + button only) */}
          {isTypographic && (
            <Section title="Typography">
              <PropertyRow
                label="Font Size"
                value={styles.fontSize ?? ''}
                onChange={handleChange('fontSize')}
                placeholder="16px"
              />
              <SelectRow
                label="Weight"
                value={styles.fontWeight ?? '400'}
                options={FONT_WEIGHTS}
                onChange={handleChange('fontWeight')}
              />
              <SelectRow
                label="Align"
                value={styles.textAlign ?? 'left'}
                options={TEXT_ALIGNS}
                onChange={handleChange('textAlign')}
              />
            </Section>
          )}

          {/* Border */}
          <Section title="Border" defaultOpen={false}>
            <SelectRow
              label="Width"
              value={styles.borderWidth ?? 'none'}
              options={BORDER_WIDTHS}
              onChange={handleChange('borderWidth')}
            />
            <ColorRow
              label="Color"
              value={styles.borderColor ?? ''}
              onChange={handleChange('borderColor')}
            />
            <SelectRow
              label="Style"
              value={styles.borderStyle ?? 'solid'}
              options={BORDER_STYLES}
              onChange={handleChange('borderStyle')}
            />
          </Section>

          {/* Effects */}
          <Section title="Effects" defaultOpen={false}>
            <SelectRow
              label="Radius"
              value={styles.borderRadius ?? 'none'}
              options={BORDER_RADII}
              onChange={handleChange('borderRadius')}
            />
            <SelectRow
              label="Shadow"
              value={styles.boxShadow ?? 'none'}
              options={SHADOWS}
              onChange={handleChange('boxShadow')}
            />
            <SelectRow
              label="Opacity"
              value={styles.opacity ? `${Math.round(parseFloat(styles.opacity) * 100)}%` : '100%'}
              options={OPACITIES}
              onChange={(v) => {
                // Convert "80%" → "0.8" before patching
                const numeric = parseFloat(v) / 100
                handleChange('opacity')(String(numeric))
              }}
            />
          </Section>

          {/* Advanced (collapsed by default) */}
          <Section title="Advanced" defaultOpen={false}>
            <div className="mb-1">
              <span className="mb-1 block text-[11px] text-muted-foreground">
                Raw Tailwind classes
              </span>
              <input
                type="text"
                placeholder="e.g. font-bold text-red-500"
                className="w-full rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 placeholder:text-muted-foreground/40"
              />
            </div>
          </Section>
        </div>
      )}

      {/* ── Footer (pinned) ────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-border">
        <div className="px-3 py-2">
          {/* Back to chat link */}
          <button
            type="button"
            onClick={onBackToChat}
            className="mb-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Chat
          </button>

          {/* Element info badges */}
          {selectedElement && (
            <div className="mb-2 flex items-center gap-1.5">
              <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                Design
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {`<${selectedElement.tagName.toLowerCase()}>`}
              </span>
            </div>
          )}

          {/* Mini prompt bar */}
          <div className="rounded-lg border border-border bg-muted/20 p-2">
            <div className="mb-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-blue-400" />
              <span className="text-[10px] font-medium text-blue-400">Visual edits</span>
            </div>
            <textarea
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  handlePromptSend()
                }
              }}
              placeholder="Ask VibeStack to modify the selected element..."
              rows={2}
              className="w-full resize-none rounded border-0 bg-transparent font-sans text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50"
            />
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={handlePromptSend}
                disabled={!promptValue.trim() || !selectedElement}
                className="flex items-center gap-1 rounded bg-blue-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-3 w-3" />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
