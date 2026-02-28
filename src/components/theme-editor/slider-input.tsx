import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface SliderInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  min: number
  max: number
  step: number
  unit?: string
  className?: string
}

export function SliderInput({
  label, value, onChange, min, max, step, unit = 'rem', className,
}: SliderInputProps) {
  const numValue = Number.parseFloat(value) || 0
  const textRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (textRef.current && textRef.current !== document.activeElement) {
      textRef.current.value = numValue.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
    }
  }, [numValue])

  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number.parseFloat(e.target.value)
      onChange(`${v}${unit}`)
    },
    [onChange, unit]
  )

  const handleText = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number.parseFloat(e.target.value)
      if (!Number.isNaN(v) && v >= min && v <= max) {
        onChange(`${v}${unit}`)
      }
    },
    [onChange, min, max, unit]
  )

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <input
            ref={textRef}
            type="text"
            defaultValue={numValue}
            onChange={handleText}
            className="h-6 w-14 rounded border border-border bg-background px-1.5 text-xs font-mono text-right"
            spellCheck={false}
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numValue}
        onChange={handleSlider}
        className="w-full accent-primary"
      />
    </div>
  )
}
