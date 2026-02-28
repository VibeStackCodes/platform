import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface HitlActionsProps {
  onApprove?: () => void
  onRequestChanges?: () => void
  approved?: boolean
  disabled?: boolean
  className?: string
}

export function HitlActions({
  onApprove,
  onRequestChanges,
  approved = false,
  disabled = false,
  className,
}: HitlActionsProps) {
  return (
    <div className={cn('flex gap-2 mt-1.5', className)}>
      {approved ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#788c5d]/12 text-[#788c5d]">
          <CheckCircle2 size={13} />
          Approved
        </span>
      ) : (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={onApprove}
            className="bg-[#d97757] hover:bg-[#c8654a] text-white px-5 py-2 rounded-full text-[13px] font-medium transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onRequestChanges}
            className="bg-transparent text-muted-foreground border border-border hover:border-muted-foreground hover:text-foreground px-5 py-2 rounded-full text-[13px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Request Changes
          </button>
        </>
      )}
    </div>
  )
}
