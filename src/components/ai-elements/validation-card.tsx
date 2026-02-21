'use client'

import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ValidationError {
  file: string
  line?: number
  message: string
  type: string
}

interface ValidationCheck {
  name: string
  status: 'passed' | 'failed' | 'running'
  errors?: ValidationError[]
}

export interface ValidationCardProps {
  checks: ValidationCheck[]
  className?: string
}

export const ValidationCard = ({ checks, className }: ValidationCardProps) => {
  const passed = checks.filter((c) => c.status === 'passed').length
  const failed = checks.filter((c) => c.status === 'failed').length

  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-3 text-sm font-medium">
          <span className="text-green-600 dark:text-green-400">{passed} passed</span>
          {failed > 0 && (
            <span className="text-red-600 dark:text-red-400">{failed} failed</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {checks.map((check) => (
          <div key={check.name} className="px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              {check.status === 'passed' && (
                <CheckCircle2 className="size-4 shrink-0 text-green-600 dark:text-green-400" />
              )}
              {check.status === 'failed' && (
                <XCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
              )}
              {check.status === 'running' && (
                <Loader2 className="size-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
              )}
              <span>{check.name}</span>
            </div>
            {check.status === 'failed' && check.errors && check.errors.length > 0 && (
              <div className="mt-2 space-y-1 pl-6">
                {check.errors.map((error, idx) => (
                  <div
                    key={idx}
                    className="rounded-md bg-red-50 px-3 py-2 dark:bg-red-900/20"
                  >
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">
                      {error.message}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-red-600 dark:text-red-400">
                      {error.file}
                      {error.line !== undefined ? `:${error.line}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
