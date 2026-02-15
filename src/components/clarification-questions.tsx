'use client'

import { ChevronLeft, ChevronRight, Send, SkipForward } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { ClarificationQuestion } from '@/lib/types'

interface ClarificationQuestionsProps {
  questions: ClarificationQuestion[]
  onSubmit: (answers: string) => void
  disabled?: boolean
}

export function ClarificationQuestions({
  questions,
  onSubmit,
  disabled = false,
}: ClarificationQuestionsProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  // answers[i] = array of selected labels for question i
  const [answers, setAnswers] = useState<string[][]>(() => questions.map(() => []))

  const question = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const isFirst = currentIndex === 0
  const hasSelection = answers[currentIndex].length > 0

  function handleSingleSelect(label: string) {
    setAnswers((prev) => {
      const next = [...prev]
      next[currentIndex] = [label]
      return next
    })
  }

  function handleMultiToggle(label: string) {
    setAnswers((prev) => {
      const next = [...prev]
      const current = next[currentIndex]
      if (current.includes(label)) {
        next[currentIndex] = current.filter((l) => l !== label)
      } else {
        next[currentIndex] = [...current, label]
      }
      return next
    })
  }

  function handleNext() {
    if (isLast) {
      handleSubmitAll()
    } else {
      setCurrentIndex((i) => i + 1)
    }
  }

  function handleBack() {
    setCurrentIndex((i) => Math.max(0, i - 1))
  }

  function handleSkipAll() {
    onSubmit('Skip all clarification questions — use your best judgment with smart defaults.')
  }

  function handleSubmitAll() {
    // Format answers as a human-readable message for the agent
    const parts = questions.map((q, i) => {
      const selected = answers[i]
      if (selected.length === 0) return `${q.question}: (skipped)`
      return `${q.question}: ${selected.join(', ')}`
    })
    onSubmit(parts.join('\n'))
  }

  if (!question) return null

  return (
    <Card className="mx-4 my-3 gap-0 border-border/50 py-0 shadow-none">
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{question.question}</CardTitle>
          <Badge variant="secondary" className="text-xs tabular-nums">
            {currentIndex + 1}/{questions.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {question.selectionMode === 'multiple' ? 'Select all that apply' : 'Choose one'}
        </p>
      </CardHeader>

      <CardContent className="pb-3">
        {question.selectionMode === 'single' ? (
          <RadioGroup
            value={answers[currentIndex][0] ?? ''}
            onValueChange={handleSingleSelect}
            disabled={disabled}
          >
            {question.options.map((opt) => (
              <label
                key={opt.label}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/50 p-3 transition-colors hover:bg-accent/50 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem value={opt.label} className="mt-0.5" />
                <div className="grid gap-0.5">
                  <span className="text-sm font-medium leading-none">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </div>
              </label>
            ))}
          </RadioGroup>
        ) : (
          <div className="grid gap-3">
            {question.options.map((opt) => {
              const checked = answers[currentIndex].includes(opt.label)
              return (
                <label
                  key={opt.label}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50 ${
                    checked ? 'border-primary/50 bg-primary/5' : 'border-border/50'
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => handleMultiToggle(opt.label)}
                    disabled={disabled}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5">
                    <span className="text-sm font-medium leading-none">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between pb-4">
        <div className="flex gap-2">
          {!isFirst && (
            <Button variant="ghost" size="sm" onClick={handleBack} disabled={disabled}>
              <ChevronLeft />
              Back
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkipAll}
            disabled={disabled}
            className="text-muted-foreground"
          >
            <SkipForward />
            Skip all
          </Button>
        </div>
        <Button size="sm" onClick={handleNext} disabled={disabled || !hasSelection}>
          {isLast ? (
            <>
              <Send />
              Submit
            </>
          ) : (
            <>
              Next
              <ChevronRight />
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
