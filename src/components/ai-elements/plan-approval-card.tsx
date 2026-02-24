import { CheckCircle2, FileText } from 'lucide-react'
import { ActionCard, ActionCardHeader, ActionCardTabs, ActionCardContent } from './action-card'
import { MessageResponse } from './message-response'

interface PlanApprovalCardProps {
  plan: {
    appName?: string
    appDescription?: string
    prd?: string
  }
  onApprove: () => void
  status: 'pending' | 'approved'
}

export function PlanApprovalCard({ plan, onApprove, status }: PlanApprovalCardProps) {
  const label =
    status === 'approved'
      ? `Plan approved — ${plan.appName ?? 'App'}`
      : `Review plan — ${plan.appName ?? 'App'}`

  return (
    <ActionCard>
      <ActionCardHeader
        icon="brain"
        label={label}
        status={status === 'approved' ? 'complete' : 'running'}
      />
      <ActionCardTabs>
        <ActionCardContent tab="details">
          <div className="space-y-3">
            {plan.appName && (
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <span className="font-medium">{plan.appName}</span>
              </div>
            )}
            {plan.appDescription && (
              <p className="text-sm text-muted-foreground">{plan.appDescription}</p>
            )}
            {plan.prd && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <MessageResponse content={plan.prd} />
              </div>
            )}
            {status === 'pending' && (
              <button
                type="button"
                onClick={onApprove}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <CheckCircle2 className="size-4" />
                Approve &amp; Generate
              </button>
            )}
          </div>
        </ActionCardContent>
      </ActionCardTabs>
    </ActionCard>
  )
}
