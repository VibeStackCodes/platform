import { type ReactNode, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import './agent-header.css'

// ── Agent color map ──────────────────────────────────────────────────

export const AGENT_COLORS = {
  analyst: '#788c5d',
  pm: '#6a9bcc',
  designer: '#d97757',
  architect: '#8b5cf6',
  backend: '#6366f1',
  frontend: '#14b8a6',
  infra: '#64748b',
} as const

export type AgentType = keyof typeof AGENT_COLORS

// ── AgentHeader ──────────────────────────────────────────────────────

interface AgentHeaderProps {
  agentType: AgentType
  name: string
  icon: ReactNode
  timer?: string
  working?: boolean
  defaultOpen?: boolean
  children?: ReactNode
  className?: string
}

export function AgentHeader({
  agentType,
  name,
  icon,
  timer,
  working = false,
  defaultOpen = true,
  children,
  className,
}: AgentHeaderProps) {
  const [open, setOpen] = useState(defaultOpen)
  const color = AGENT_COLORS[agentType]

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('w-full', className)}>
      <CollapsibleTrigger asChild>
        <div className="flex cursor-pointer select-none items-center gap-2 py-1">
          {/* Agent avatar */}
          <Avatar
            size="sm"
            className={cn(
              'size-7 shrink-0',
              working && 'animate-[throb_2s_ease-in-out_infinite]',
            )}
            style={{
              backgroundColor: `color-mix(in srgb, ${color} 14%, var(--background))`,
              color,
            }}
          >
            <AvatarFallback
              className="size-full bg-transparent [&>svg]:size-3.5"
              style={{ color }}
            >
              {icon}
            </AvatarFallback>
          </Avatar>

          {/* Name */}
          <span className="text-[13px] font-semibold text-muted-foreground">{name}</span>

          {/* Working indicator */}
          {working && (
            <span className="animate-[pulse-text_2s_ease-in-out_infinite] text-[13.5px] text-muted-foreground">
              Working…
            </span>
          )}

          {/* Timer */}
          {timer && !working && (
            <span className="font-mono text-[11.5px] tracking-tight text-muted-foreground/50">
              {timer}
            </span>
          )}

          {/* Chevron */}
          <ChevronDown
            className={cn(
              'ml-auto size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200',
              !open && '-rotate-90',
            )}
          />
        </div>
      </CollapsibleTrigger>

      {children != null && (
        <CollapsibleContent className="pt-1 pb-0.5">
          <div className="pl-9">{children}</div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

// ── AgentMessage ─────────────────────────────────────────────────────

interface AgentMessageProps extends AgentHeaderProps {
  children: ReactNode
}

export function AgentMessage({
  agentType,
  name,
  icon,
  timer,
  working,
  defaultOpen,
  children,
  className,
}: AgentMessageProps) {
  return (
    <div className={cn('flex w-full flex-col', className)}>
      <AgentHeader
        agentType={agentType}
        name={name}
        icon={icon}
        timer={timer}
        working={working}
        defaultOpen={defaultOpen}
      >
        {children}
      </AgentHeader>
    </div>
  )
}
