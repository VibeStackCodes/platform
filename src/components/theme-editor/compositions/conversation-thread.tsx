import {
  ActionCard,
  ActionCardContent,
  ActionCardHeader,
  ActionCardSummary,
  ActionCardTabs,
} from '@/components/ai-elements/action-card'
import { ThinkingCard } from '@/components/ai-elements/thinking-card'

export function ConversationThread() {
  const now = Date.now()

  return (
    <div className="flex flex-col gap-3">
      {/* User message */}
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-primary px-4 py-2 text-primary-foreground text-sm">
          Build me a dashboard with user analytics
        </div>
      </div>

      {/* Thinking card — status must be 'thinking' | 'complete' */}
      <ThinkingCard startedAt={now - 3000} status="complete" durationMs={2800}>
        Planning the dashboard layout with charts, user stats, and activity feed...
      </ThinkingCard>

      {/* Action card — compound component pattern */}
      <ActionCard>
        <ActionCardHeader
          icon="code"
          label="Writing src/components/Dashboard.tsx"
          status="complete"
          durationMs={1200}
        />
        <ActionCardSummary>
          Created dashboard component with analytics grid, user stat cards, and activity feed.
        </ActionCardSummary>
        <ActionCardTabs>
          <ActionCardContent tab="details">
            <p className="text-xs text-muted-foreground">
              Wrote 147 lines across 3 components. Used shadcn/ui Card, Badge, and Progress
              primitives for a clean analytics layout.
            </p>
          </ActionCardContent>
        </ActionCardTabs>
      </ActionCard>

      {/* Assistant response */}
      <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2 text-sm">
        I've created the dashboard with three components. The layout uses a responsive grid with
        user statistics at the top and an activity feed below.
      </div>
    </div>
  )
}
