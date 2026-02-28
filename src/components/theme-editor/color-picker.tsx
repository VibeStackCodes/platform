import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function ColorPicker({ label, value, onChange, className }: ColorPickerProps) {
  const textRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    if (textRef.current && textRef.current !== document.activeElement) {
      textRef.current.value = value
    }
  }, [value])

  const debouncedChange = useCallback(
    (v: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onChange(v), 150)
    },
    [onChange]
  )

  const handleColorInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (textRef.current) textRef.current.value = v
      debouncedChange(v)
    },
    [debouncedChange]
  )

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        debouncedChange(v)
      }
    },
    [debouncedChange]
  )

  const handleTextBlur = useCallback(() => {
    if (textRef.current) textRef.current.value = value
  }, [value])

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <span className="text-sm text-muted-foreground truncate">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="relative h-6 w-6 shrink-0">
          <div
            className="absolute inset-0 rounded border border-border"
            style={{ backgroundColor: value }}
          />
          <input
            type="color"
            value={value}
            onChange={handleColorInput}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <input
          ref={textRef}
          type="text"
          defaultValue={value}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          className="h-6 w-20 rounded border border-border bg-background px-1.5 text-xs font-mono"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
