'use client'

import { Coins } from 'lucide-react'
import { useMemo } from 'react'

interface CreditDisplayProps {
  remaining: number
  monthly: number
  plan: 'free' | 'pro'
  resetAt?: string | null
}

export function CreditDisplay({
  remaining,
  monthly,
  plan: _plan,
  resetAt: _resetAt,
}: CreditDisplayProps) {
  const pct = useMemo(() => (monthly > 0 ? (remaining / monthly) * 100 : 0), [remaining, monthly])
  const isLow = pct < 20

  return (
    <div className="flex items-center gap-2 text-sm">
      <Coins className={`size-4 ${isLow ? 'text-amber-500' : 'text-muted-foreground'}`} />
      <span className={isLow ? 'text-amber-500 font-medium' : 'text-muted-foreground'}>
        {remaining.toLocaleString()} / {monthly.toLocaleString()}
      </span>
    </div>
  )
}
