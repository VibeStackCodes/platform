import { ClarificationQuestions } from '@/components/clarification-questions'
import type { ClarificationQuestion } from '@/lib/types'

const MOCK_QUESTIONS: ClarificationQuestion[] = [
  {
    question: 'What authentication method do you prefer?',
    selectionMode: 'single',
    options: [
      { label: 'Email/Password', description: 'Traditional email-based auth' },
      { label: 'OAuth (Google)', description: 'Sign in with Google' },
      { label: 'Magic Link', description: 'Passwordless email links' },
    ],
  },
]

export function BuilderInput() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 text-sm text-muted-foreground">
            Describe what you want to build...
          </div>
          <div className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground font-medium">
            Send
          </div>
        </div>
      </div>

      <ClarificationQuestions
        questions={MOCK_QUESTIONS}
        onSubmit={() => {}}
        disabled={false}
      />
    </div>
  )
}
