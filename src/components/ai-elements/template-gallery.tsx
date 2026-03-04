import { Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TemplateGalleryTemplate {
  id: string
  name: string
  category: string
  description: string
  screenshotUrl: string
}

export interface TemplateGalleryProps {
  templates: TemplateGalleryTemplate[]
  selectedId?: string
  onSelect: (templateId: string | null) => void
}

/** Deterministic gradient from a string — keeps the same template card color across renders */
function gradientForId(id: string): string {
  const gradients = [
    'from-violet-500/30 to-indigo-500/30',
    'from-sky-500/30 to-cyan-500/30',
    'from-emerald-500/30 to-teal-500/30',
    'from-orange-500/30 to-amber-500/30',
    'from-rose-500/30 to-pink-500/30',
    'from-fuchsia-500/30 to-purple-500/30',
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return gradients[hash % gradients.length]
}

function SelectedBadge() {
  return (
    <div className="absolute top-2 right-2 size-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
      <Check size={11} strokeWidth={2.5} className="text-primary-foreground" />
    </div>
  )
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-medium capitalize border border-border/60">
      {category}
    </span>
  )
}

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: TemplateGalleryTemplate
  isSelected: boolean
  onSelect: () => void
}) {
  const gradient = gradientForId(template.id)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex flex-col rounded-xl border bg-card text-left transition-all duration-150 overflow-hidden',
        'hover:border-primary/50 hover:scale-[1.015] hover:shadow-md',
        isSelected
          ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.015]'
          : 'border-border',
      )}
    >
      {/* Screenshot / placeholder area */}
      <div
        className={cn('relative h-32 w-full bg-gradient-to-br', gradient, 'flex items-end p-2.5')}
      >
        <span className="text-[11px] font-semibold text-foreground/80 drop-shadow-sm line-clamp-1">
          {template.name}
        </span>
        {isSelected && <SelectedBadge />}
      </div>

      {/* Card body */}
      <div className="flex flex-col gap-1.5 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{template.name}</p>
          <CategoryBadge category={template.category} />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {template.description}
        </p>
      </div>
    </button>
  )
}

function ScratchCard({ isSelected, onSelect }: { isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card text-left transition-all duration-150 min-h-[168px]',
        'hover:border-primary/50 hover:scale-[1.015] hover:shadow-md hover:bg-secondary/50',
        isSelected
          ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.015] bg-secondary/50'
          : 'border-border',
      )}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 size-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
          <Check size={11} strokeWidth={2.5} className="text-primary-foreground" />
        </div>
      )}
      <div
        className={cn(
          'size-9 rounded-xl flex items-center justify-center transition-colors',
          isSelected ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground',
        )}
      >
        <Sparkles size={18} strokeWidth={1.75} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">Start from scratch</p>
        <p className="text-xs text-muted-foreground mt-0.5">AI-generated design</p>
      </div>
    </button>
  )
}

export function TemplateGallery({ templates, selectedId, onSelect }: TemplateGalleryProps) {
  const scratchSelected = selectedId == null

  return (
    <div className="grid grid-cols-2 gap-3">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          isSelected={selectedId === template.id}
          onSelect={() => onSelect(template.id)}
        />
      ))}
      <ScratchCard isSelected={scratchSelected} onSelect={() => onSelect(null)} />
    </div>
  )
}
