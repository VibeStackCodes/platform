import { cn } from '@/lib/utils'

export interface ScriptBlockProps {
  command: string
  commandLabel?: string
  output?: string
  outputLabel?: string
  className?: string
}

export function ScriptBlock({
  command,
  commandLabel = 'Command',
  output,
  outputLabel = 'Output',
  className,
}: ScriptBlockProps) {
  return (
    <div
      className={cn(
        'border border-border/50 rounded-2xl p-2.5 flex flex-col gap-1.5 bg-background',
        className,
      )}
    >
      <div className="bg-[#f5f3ed] dark:bg-muted rounded-xl px-4 py-3.5">
        <span className="text-muted-foreground block mb-1.5 text-[13.5px] font-sans">
          {commandLabel}
        </span>
        <pre className="font-mono text-[13.5px] leading-[1.7] text-foreground whitespace-pre-wrap break-all">
          {command}
        </pre>
      </div>

      {output !== undefined && (
        <div className="bg-[#f5f3ed] dark:bg-muted rounded-xl px-4 py-3.5">
          <span className="text-muted-foreground block mb-1.5 text-[13.5px] font-sans">
            {outputLabel}
          </span>
          <p className="font-sans text-[13.5px] leading-[1.7] text-foreground whitespace-pre-wrap">
            {output}
          </p>
        </div>
      )}
    </div>
  )
}
