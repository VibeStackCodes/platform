'use client'

import { useNavigate } from '@tanstack/react-router'
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input'
import { PromptBar } from '@/components/prompt-bar'
import { supabase } from '@/lib/supabase-browser'

const PENDING_PROMPT_KEY = 'vibestack_pending_prompt'

export function HeroPrompt() {
  const navigate = useNavigate()

  async function handleSubmit(
    message: PromptInputMessage,
    _options?: { model: string; webSearch: boolean },
  ) {
    const prompt = message.text.trim()
    if (!prompt) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      sessionStorage.setItem(PENDING_PROMPT_KEY, prompt)
      navigate({ to: '/auth/login' })
      return
    }

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: prompt.slice(0, 80), prompt }),
    })
    const project = await res.json()

    if (!project?.id) {
      console.error('Failed to create project')
      return
    }

    navigate({ to: '/project/$id', params: { id: project.id } })
  }

  return (
    <div className="mt-10 w-full max-w-2xl">
      <PromptBar onSubmit={handleSubmit} />
    </div>
  )
}
