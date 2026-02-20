'use client'

import { useNavigate } from '@tanstack/react-router'
import { LandingPromptBar, type PromptInputMessage } from '@/components/landing-prompt-bar'
import { useAuth } from '@/lib/auth'
import { apiFetch } from '@/lib/utils'

const PENDING_PROMPT_KEY = 'vibestack_pending_prompt'

export function HeroPrompt() {
  const navigate = useNavigate()
  const { user } = useAuth()

  async function handleSubmit(message: PromptInputMessage) {
    const prompt = message.text.trim()
    if (!prompt) return

    if (!user) {
      sessionStorage.setItem(PENDING_PROMPT_KEY, prompt)
      navigate({ to: '/auth/login' })
      return
    }

    const res = await apiFetch('/api/projects', {
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

  return <LandingPromptBar onSubmit={handleSubmit} />
}
