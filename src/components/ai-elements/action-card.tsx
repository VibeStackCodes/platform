import { type ReactNode, createContext, useContext, useState } from 'react'
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  Code2,
  Loader2,
  type LucideIcon,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// --- Icon registry ---
const ICONS: Record<string, LucideIcon> = {
  brain: Brain,
  sparkles: Sparkles,
  code: Code2,
  package: Package,
  shield: ShieldCheck,
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

// --- Context for tab state ---
interface ActionCardContextValue {
  activeTab: string | null
  setActiveTab: (tab: string | null) => void
}

const ActionCardContext = createContext<ActionCardContextValue>({
  activeTab: null,
  setActiveTab: () => {},
})

// --- ActionCard (root) ---
export function ActionCard({ children, className }: { children: ReactNode; className?: string }) {
  const [activeTab, setActiveTab] = useState<string | null>(null)
  return (
    <ActionCardContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn('w-full rounded-lg border bg-card', className)}>{children}</div>
    </ActionCardContext.Provider>
  )
}

// --- ActionCardHeader ---
export interface ActionCardHeaderProps {
  icon: string
  label: string
  status: 'running' | 'complete'
  durationMs?: number
  elapsedMs?: number
}

export function ActionCardHeader({ icon, label, status, durationMs, elapsedMs }: ActionCardHeaderProps) {
  const Icon = ICONS[icon] ?? Sparkles
  const { activeTab, setActiveTab } = useContext(ActionCardContext)

  return (
    <button
      type="button"
      onClick={() => setActiveTab(activeTab ? null : 'details')}
      aria-label={label}
      className="flex w-full items-center gap-2 p-3 text-left"
    >
      {status === 'complete' ? (
        <CheckCircle2 className="size-4 shrink-0 text-green-500" />
      ) : (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      )}
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
      {status === 'complete' && durationMs != null && (
        <span className="text-xs text-muted-foreground">{formatDuration(durationMs)}</span>
      )}
      {status === 'running' && elapsedMs != null && (
        <span className="text-xs text-muted-foreground">{formatDuration(elapsedMs)}</span>
      )}
      <ChevronDown
        className={cn(
          'ml-auto size-4 text-muted-foreground transition-transform',
          activeTab && 'rotate-180',
        )}
      />
    </button>
  )
}

// --- ActionCardSummary (visible when collapsed, hidden when any tab is active) ---
export function ActionCardSummary({ children, className }: { children: ReactNode; className?: string }) {
  const { activeTab } = useContext(ActionCardContext)
  if (activeTab) return null
  return <div className={cn('px-3 pb-3 text-sm text-muted-foreground', className)}>{children}</div>
}

// --- ActionCardTabs (Details / Preview toggle + content) ---
export function ActionCardTabs({ children }: { children: ReactNode }) {
  const { activeTab, setActiveTab } = useContext(ActionCardContext)
  if (!activeTab) return null

  // Extract tab names and content from ActionCardContent children
  const tabs: string[] = []
  const contents = new Map<string, ReactNode>()

  const childArray = Array.isArray(children) ? children : [children]
  for (const child of childArray) {
    if (
      child !== null &&
      child !== undefined &&
      typeof child === 'object' &&
      'props' in child &&
      typeof (child as { props: Record<string, unknown> }).props.tab === 'string'
    ) {
      const tab = (child as { props: { tab: string; children?: ReactNode } }).props.tab
      tabs.push(tab)
      contents.set(tab, (child as { props: { tab: string; children?: ReactNode } }).props.children)
    }
  }

  return (
    <div className="border-t">
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b px-3 py-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors',
                activeTab === tab
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      )}
      <div className="p-3">{contents.get(activeTab) ?? contents.get(tabs[0])}</div>
    </div>
  )
}

// --- ActionCardContent (tab content slot — rendered by ActionCardTabs) ---
export function ActionCardContent(_props: { tab: string; children?: ReactNode }): null {
  // This component is a slot marker only — ActionCardTabs reads its props directly.
  return null
}
