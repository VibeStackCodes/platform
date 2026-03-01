import type { ReactNode } from 'react'
import { Globe, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PreviewCardProps {
  title?: string
  url?: string
  placeholder?: ReactNode
  onOpen?: () => void
  className?: string
}

function DefaultPlaceholder() {
  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <Monitor size={28} strokeWidth={1.5} />
      <span className="text-[13px]">Preview will appear here</span>
    </div>
  )
}

// oxlint-disable eslint-plugin-react/iframe-missing-sandbox -- trusted Daytona origin; both flags are required for the preview sandbox to function
function PreviewIframe({ src }: { src: string }) {
  return (
    <iframe
      src={src}
      className="size-full border-0"
      title="Preview"
      sandbox="allow-scripts allow-same-origin"
    />
  )
}
// oxlint-enable eslint-plugin-react/iframe-missing-sandbox

export function PreviewCard({
  title = 'Live Preview',
  url,
  placeholder,
  onOpen,
  className,
}: PreviewCardProps) {
  return (
    <div className={cn('bg-secondary border border-border rounded-xl overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 text-[13px] font-semibold text-foreground border-b border-border">
        <Globe size={15} className="text-[oklch(0.6118_0.0713_127.12)]" />
        {title}
      </div>

      {/* Body */}
      <div className="bg-white aspect-[16/10] flex items-center justify-center relative overflow-hidden">
        {url ? <PreviewIframe src={url} /> : (placeholder ?? <DefaultPlaceholder />)}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border">
        <span className="text-xs font-mono text-[oklch(0.6742_0.0901_249.29)] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {url ?? 'No URL'}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="px-3 py-1 border border-border rounded-md bg-background text-foreground text-xs font-medium hover:bg-muted transition-colors"
        >
          Open
        </button>
      </div>
    </div>
  )
}
