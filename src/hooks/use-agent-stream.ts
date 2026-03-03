import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/utils'
import { supabase } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth'
import type {
  AgentStartEvent,
  ArchitectureReadyEvent,
  BuildError,
  ClarificationQuestion,
  DesignTokensEvent,
  ElementContext,
  FileAssemblyEntry,
  PageProgressEntry,
  PlanReadyEvent,
  StreamEvent,
  TimelineEntry,
  ValidationCheckEntry,
} from '@/lib/types'

/** Maps agentId to ActionCard display config */
export const AGENT_CARD_CONFIG: Record<
  string,
  { icon: string; runningLabel: string; completeLabel?: string }
> = {
  analyst: { icon: 'brain', runningLabel: 'Analyzing...', completeLabel: 'Analyzed requirements' },
  architect: {
    icon: 'sparkles',
    runningLabel: 'Designing architecture...',
    completeLabel: 'Designed app architecture',
  },
  frontend: { icon: 'code', runningLabel: 'Generating pages...', completeLabel: 'Generated pages' },
  backend: {
    icon: 'package',
    runningLabel: 'Assembling files...',
    completeLabel: 'Assembled files',
  },
  qa: { icon: 'shield', runningLabel: 'Validating build...', completeLabel: 'Validation complete' },
}

export const SUGGESTIONS = [
  'A todo app with authentication',
  'A blog with markdown editor',
  'An e-commerce store with Stripe',
  'A real-time chat application',
]

/** Tools internal to Mastra that should not surface in the UI */
const INTERNAL_TOOLS = new Set(['updateWorkingMemory', 'readWorkingMemory'])

// Tool step for compact tool activity display
export interface ToolStep {
  id: string
  tool: string
  label: string
  status: 'running' | 'complete' | 'error'
  filePath?: string // Extracted from args.path
  oldContent?: string // Previous file content (for diffs)
  newContent?: string // New file content (for diffs)
  result?: string // Summary from tool_complete
  durationMs?: number
  startedAt: number
  turnId?: string // Associates step with the assistant message that triggered it
}

// Custom message type
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface UseAgentStreamOptions {
  projectId: string
  initialPrompt?: string
  onGenerationComplete?: () => void
  onSandboxReady?: (sandboxId: string) => void
  selectedElement?: ElementContext | null
  onEditComplete?: () => void
}

export interface UseAgentStreamReturn {
  // State
  model: string
  setModel: (model: string) => void
  generationStatus: 'idle' | 'generating' | 'complete' | 'error'
  doneSummary?: string
  generationFiles: Array<{
    path: string
    status: 'pending' | 'generating' | 'complete' | 'error'
    lines?: number
  }>
  buildErrors: BuildError[]
  pageProgress: PageProgressEntry[]
  fileAssembly: FileAssemblyEntry[]
  validationChecks: ValidationCheckEntry[]
  timelineEvents: TimelineEntry[]
  toolSteps: ToolStep[]
  pendingClarification: ClarificationQuestion[] | null
  pendingPlan: PlanReadyEvent['plan'] | null
  userCredits: {
    credits_remaining: number
    credits_monthly: number
    plan: 'free' | 'pro'
    credits_reset_at: string | null
  } | null
  messages: ChatMessage[]
  chatStatus: 'ready' | 'streaming'
  chatError: Error | null
  hasFiles: boolean
  showTimeline: boolean

  // Actions
  sendMessage: (text: string) => void
  addSystemMessage: (content: string) => void
  handleStop: () => void
  handleClarificationSubmit: (answersText: string) => Promise<void>
  handlePlanApprove: () => Promise<void>
  handleSubmit: (message: { text?: string }, options: { model: string; mode: string }) => void
  handleSuggestionClick: (suggestion: string) => void
}

export function useAgentStream({
  projectId,
  initialPrompt,
  onGenerationComplete,
  onSandboxReady,
  selectedElement,
  onEditComplete,
}: UseAgentStreamOptions): UseAgentStreamReturn {
  const [model, setModel] = useState('gpt-5.2-codex')
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'generating' | 'complete' | 'error'
  >('idle')
  const [doneSummary, setDoneSummary] = useState<string>()

  const [generationFiles, setGenerationFiles] = useState<
    { path: string; status: 'pending' | 'generating' | 'complete' | 'error'; lines?: number }[]
  >([])
  const [buildErrors, setBuildErrors] = useState<BuildError[]>([])

  const [pageProgress, setPageProgress] = useState<PageProgressEntry[]>([])
  const [fileAssembly, setFileAssembly] = useState<FileAssemblyEntry[]>([])
  const [validationChecks, setValidationChecks] = useState<ValidationCheckEntry[]>([])

  const [timelineEvents, setTimelineEvents] = useState<TimelineEntry[]>([])
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([])
  const toolStepCounter = useRef(0)
  const currentTurnId = useRef<string | undefined>(undefined)

  const [pendingClarification, setPendingClarification] = useState<ClarificationQuestion[] | null>(
    null,
  )
  const [resumeRunId, setResumeRunId] = useState<string | null>(null)
  const [pendingPlan, setPendingPlan] = useState<PlanReadyEvent['plan'] | null>(null)
  const [planRunId, setPlanRunId] = useState<string | null>(null)
  const [userCredits, setUserCredits] = useState<{
    credits_remaining: number
    credits_monthly: number
    plan: 'free' | 'pro'
    credits_reset_at: string | null
  } | null>(null)
  const hasAutoSubmitted = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const sendChatMessageRef = useRef<(text: string) => void>(() => {})
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: conversationEvents } = useQuery({
    queryKey: ['project-conversation', projectId],
    queryFn: async () => {
      const res = await apiFetch(`/api/projects/${projectId}/messages`)
      if (!res.ok) return []
      return (await res.json()) as Array<{
        id: string
        role: string
        type: string
        parts: unknown
        createdAt: string
      }>
    },
    staleTime: Number.POSITIVE_INFINITY,
  })

  const { data: creditsData } = useQuery({
    queryKey: ['user-credits', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('credits_remaining, credits_monthly, credits_reset_at, plan')
        .eq('id', user.id)
        .single()
      if (error || !data) return null
      return data as {
        credits_remaining: number
        credits_monthly: number
        credits_reset_at: string | null
        plan: 'free' | 'pro'
      }
    },
    enabled: !!user?.id,
  })

  useEffect(() => {
    if (creditsData) {
      setUserCredits(creditsData)
    }
  }, [creditsData])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  /** Stop the current generation */
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    setChatStatus('ready')
    setGenerationStatus('idle')
  }, [])

  const {
    persistedMessages,
    persistedTimeline,
    persistedValidation,
    persistedPageProgress,
    persistedFileAssembly,
    persistedToolSteps,
  } = useMemo(() => {
    if (!conversationEvents?.length) {
      return {
        persistedMessages: [] as ChatMessage[],
        persistedTimeline: [] as TimelineEntry[],
        persistedValidation: [] as Array<{ name: string; status: string; errors?: string[] }>,
        persistedPageProgress: [] as Array<Record<string, unknown>>,
        persistedFileAssembly: [] as Array<{ path: string; category: string }>,
        persistedToolSteps: [] as ToolStep[],
      }
    }

    const messages: ChatMessage[] = []
    const timeline: TimelineEntry[] = []
    const validation: Array<{ name: string; status: string; errors?: string[] }> = []
    const pageProgressArr: Array<Record<string, unknown>> = []
    const fileAssemblyArr: Array<{ path: string; category: string }> = []
    const toolStepsArr: ToolStep[] = []
    // Buffer tool steps until the next assistant message arrives, then tag them
    let pendingPersistedTools: ToolStep[] = []

    for (const evt of conversationEvents) {
      const p = Array.isArray(evt.parts) ? evt.parts[0] : evt.parts
      switch (evt.type) {
        case 'message': {
          const role = (evt.role === 'system' ? 'assistant' : evt.role) as 'user' | 'assistant'
          if (role === 'assistant') {
            // Flush buffered tool steps — they belong to this assistant turn
            for (const step of pendingPersistedTools) {
              step.turnId = evt.id
            }
            toolStepsArr.push(...pendingPersistedTools)
            pendingPersistedTools = []
          }
          messages.push({
            id: evt.id,
            role,
            content: (Array.isArray(evt.parts) ? evt.parts : [])
              .map((part: Record<string, unknown>) => (part.text as string) || '')
              .filter(Boolean)
              .join(''),
          })
          break
        }
        case 'agent_start':
          timeline.push({
            type: 'agent',
            ts: new Date(evt.createdAt).getTime(),
            agent: p as AgentStartEvent,
            status: 'running',
          })
          break
        case 'agent_complete': {
          const data = p as Record<string, unknown>
          const idx = timeline.findLastIndex(
            (e) => e.type === 'agent' && e.agent.agentId === data.agentId,
          )
          if (idx >= 0) {
            const agentEntry = timeline[idx] as Extract<TimelineEntry, { type: 'agent' }>
            timeline[idx] = {
              ...agentEntry,
              status: 'complete' as const,
              durationMs: data.durationMs as number,
            }
          }
          break
        }
        case 'agent_progress': {
          const data = p as Record<string, unknown>
          const idx = timeline.findLastIndex(
            (e) => e.type === 'agent' && e.agent.agentId === data.agentId,
          )
          if (idx >= 0) {
            const entry = timeline[idx]
            if (entry.type === 'agent') {
              timeline[idx] = {
                ...entry,
                progressMessages: [...(entry.progressMessages ?? []), data.message as string],
              }
            }
          }
          break
        }
        case 'design_tokens': {
          const data = p as Record<string, unknown>
          const idx = timeline.findLastIndex(
            (e) => e.type === 'agent' && e.agent.agentId === 'architect',
          )
          if (idx >= 0) {
            const agentEntry = timeline[idx] as Extract<TimelineEntry, { type: 'agent' }>
            timeline[idx] = {
              ...agentEntry,
              designTokens: data.tokens as DesignTokensEvent['tokens'],
            }
          }
          break
        }
        case 'architecture_ready': {
          const data = p as Record<string, unknown>
          const idx = timeline.findLastIndex(
            (e) => e.type === 'agent' && e.agent.agentId === 'architect',
          )
          if (idx >= 0) {
            const agentEntry = timeline[idx] as Extract<TimelineEntry, { type: 'agent' }>
            timeline[idx] = {
              ...agentEntry,
              architecture: data.spec as ArchitectureReadyEvent['spec'],
            }
          }
          break
        }
        case 'plan_ready': {
          const data = p as Record<string, unknown>
          const idx = timeline.findLastIndex(
            (e) => e.type === 'agent' && e.agent.agentId === 'analyst',
          )
          if (idx >= 0) {
            const agentEntry = timeline[idx] as Extract<TimelineEntry, { type: 'agent' }>
            timeline[idx] = { ...agentEntry, plan: data.plan as PlanReadyEvent['plan'] }
          }
          break
        }
        case 'validation_check': {
          const data = p as Record<string, unknown>
          const existing = validation.findIndex((v) => v.name === data.name)
          if (existing >= 0)
            validation[existing] = data as { name: string; status: string; errors?: string[] }
          else validation.push(data as { name: string; status: string; errors?: string[] })
          break
        }
        case 'page_complete':
          pageProgressArr.push(p as Record<string, unknown>)
          break
        case 'file_assembled': {
          const data = p as Record<string, unknown>
          fileAssemblyArr.push({ path: data.path as string, category: data.category as string })
          break
        }
        case 'completion':
          timeline.push({
            type: 'complete',
            ts: new Date(evt.createdAt).getTime(),
            deploymentUrl: (p as Record<string, unknown>)?.deployUrl as string | undefined,
          })
          break
        case 'error':
          timeline.push({
            type: 'error',
            ts: new Date(evt.createdAt).getTime(),
            error: (p as Record<string, unknown>)?.message as string,
          })
          break
        case 'tool_complete': {
          const data = evt as unknown as {
            id: string
            tool: string
            label: string
            filePath?: string
            args?: Record<string, unknown>
            createdAt: string
          }
          pendingPersistedTools.push({
            id: data.id,
            tool: data.tool,
            label: data.label,
            status: 'complete',
            filePath: data.filePath,
            startedAt: new Date(data.createdAt).getTime(),
          })
          break
        }
      }
    }

    // Flush any remaining buffered tools (generation still in progress, no final assistant msg yet)
    toolStepsArr.push(...pendingPersistedTools)

    return {
      persistedMessages: messages,
      persistedTimeline: timeline,
      persistedValidation: validation,
      persistedPageProgress: pageProgressArr,
      persistedFileAssembly: fileAssemblyArr,
      persistedToolSteps: toolStepsArr,
    }
  }, [conversationEvents])

  const hasHydratedFromEvents = useRef(false)
  useEffect(() => {
    if (hasHydratedFromEvents.current) return
    if (persistedTimeline.length > 0 && timelineEvents.length === 0) {
      hasHydratedFromEvents.current = true
      setTimelineEvents(persistedTimeline)
    }
    if (persistedValidation.length > 0 && validationChecks.length === 0) {
      setValidationChecks(persistedValidation as ValidationCheckEntry[])
    }
    if (persistedPageProgress.length > 0 && pageProgress.length === 0) {
      setPageProgress(persistedPageProgress as PageProgressEntry[])
    }
    if (persistedFileAssembly.length > 0 && fileAssembly.length === 0) {
      setFileAssembly(persistedFileAssembly as FileAssemblyEntry[])
    }
    if (persistedToolSteps.length > 0 && toolSteps.length === 0) {
      setToolSteps(persistedToolSteps)
    }
    if (persistedTimeline.some((e) => e.type === 'complete')) {
      setGenerationStatus('complete')
    } else if (persistedTimeline.some((e) => e.type === 'error')) {
      setGenerationStatus('error')
    } else if (persistedToolSteps.length > 0) {
      // Single orchestrator: no timeline events, but tool steps + assistant message = complete
      const lastAssistant = persistedMessages.findLast((m) => m.role === 'assistant')
      if (lastAssistant?.content) {
        setGenerationStatus('complete')
        setDoneSummary(lastAssistant.content)
      }
    }
  }, [
    persistedTimeline,
    persistedValidation,
    persistedPageProgress,
    persistedFileAssembly,
    persistedToolSteps,
    timelineEvents.length,
    validationChecks.length,
    pageProgress.length,
    fileAssembly.length,
    toolSteps.length,
  ])

  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([])
  const messages = useMemo(() => {
    if (sessionMessages.length === 0) return persistedMessages
    const historyIds = new Set(persistedMessages.map((m) => m.id))
    return [...persistedMessages, ...sessionMessages.filter((m) => !historyIds.has(m.id))]
  }, [persistedMessages, sessionMessages])

  const [chatStatus, setChatStatus] = useState<'ready' | 'streaming'>('ready')
  const [chatError, setChatError] = useState<Error | null>(null)

  const pushTimeline = useCallback((entry: TimelineEntry) => {
    setTimelineEvents((prev) => [...prev, entry])
  }, [])

  const updateTimeline = useCallback(
    (predicate: (e: TimelineEntry) => boolean, updater: (e: TimelineEntry) => TimelineEntry) => {
      setTimelineEvents((prev) => {
        const idx = prev.findLastIndex(predicate)
        if (idx < 0) return prev
        const updated = [...prev]
        updated[idx] = updater(prev[idx])
        return updated
      })
    },
    [],
  )

  const handleGenerationEvent = useCallback(
    (event: StreamEvent) => {
      const now = Date.now()

      switch (event.type) {
        case 'stage_update':
          if (event.stage === 'complete') {
            setGenerationStatus('complete')
          } else if (event.stage === 'error') {
            setGenerationStatus('error')
          }
          break

        case 'agent_start':
          pushTimeline({
            type: 'agent',
            ts: now,
            agent: event,
            status: 'running',
          })
          break

        case 'agent_complete':
          updateTimeline(
            (e) => e.type === 'agent' && e.agent.agentId === event.agentId,
            (e) => ({
              ...e,
              status: 'complete' as const,
              durationMs: event.durationMs,
            }),
          )
          break

        case 'agent_progress':
          updateTimeline(
            (e) => e.type === 'agent' && e.agent.agentId === event.agentId,
            (e) => {
              if (e.type !== 'agent') return e
              return {
                ...e,
                progressMessages: [...(e.progressMessages ?? []), event.message],
              }
            },
          )
          break

        case 'agent_artifact':
          break

        case 'plan_ready':
          setPendingPlan(event.plan)
          updateTimeline(
            (e) => e.type === 'agent' && e.agent.agentId === 'architect',
            (e) => ({ ...e, plan: event.plan }),
          )
          break

        case 'file_start':
          setGenerationFiles((prev) => {
            const exists = prev.some((f) => f.path === event.path)
            if (exists) {
              return prev.map((f) =>
                f.path === event.path ? { ...f, status: 'generating' as const } : f,
              )
            }
            return [...prev, { path: event.path, status: 'generating' as const }]
          })
          break

        case 'file_complete':
          setGenerationFiles((prev) =>
            prev.map((f) =>
              f.path === event.path
                ? { ...f, status: 'complete' as const, lines: event.linesOfCode }
                : f,
            ),
          )
          break

        case 'file_error':
          setGenerationFiles((prev) =>
            prev.map((f) => (f.path === event.path ? { ...f, status: 'error' as const } : f)),
          )
          break

        case 'complete':
          setGenerationStatus('complete')
          pushTimeline({
            type: 'complete',
            ts: now,
            deploymentUrl: event.urls?.deploy,
          })
          onGenerationComplete?.()
          break

        case 'error':
          setGenerationStatus('error')
          pushTimeline({ type: 'error', ts: now, error: event.message })
          break

        case 'build_error':
          setBuildErrors(event.errors)
          break

        case 'credits_used':
          setUserCredits((prev) =>
            prev
              ? {
                  ...prev,
                  credits_remaining: event.creditsRemaining,
                }
              : prev,
          )
          break

        case 'clarification_request':
          setPendingClarification(event.questions)
          setResumeRunId(event.runId)
          updateTimeline(
            (e) => e.type === 'agent' && e.agent.agentId === 'analyst',
            (e) => ({ ...e, clarificationQuestions: event.questions }),
          )
          break

        case 'design_tokens':
          updateTimeline(
            (e) => e.type === 'agent' && e.agent.agentId === 'architect',
            (e) => ({ ...e, designTokens: event.tokens }),
          )
          break

        case 'architecture_ready':
          updateTimeline(
            (e) => e.type === 'agent' && e.agent.agentId === 'architect',
            (e) => ({ ...e, architecture: event.spec }),
          )
          break

        case 'page_generating':
          setPageProgress((prev) => {
            const updated = [...prev]
            const idx = updated.findIndex((p) => p.fileName === event.fileName)
            if (idx === -1) {
              updated.push({
                fileName: event.fileName,
                route: event.route,
                componentName: event.componentName,
                status: 'generating',
              })
            } else {
              updated[idx] = { ...updated[idx], status: 'generating' }
            }
            return updated
          })
          break

        case 'page_complete':
          setPageProgress((prev) => {
            const idx = prev.findIndex((p) => p.fileName === event.fileName)
            if (idx === -1) {
              return [
                ...prev,
                {
                  fileName: event.fileName,
                  route: event.route,
                  componentName: event.componentName,
                  status: 'complete' as const,
                  lineCount: event.lineCount,
                  code: event.code,
                },
              ]
            }
            const updated = [...prev]
            updated[idx] = {
              ...updated[idx],
              status: 'complete' as const,
              lineCount: event.lineCount,
              code: event.code,
            }
            return updated
          })
          break

        case 'file_assembled':
          setFileAssembly((prev) =>
            prev.some((f) => f.path === event.path)
              ? prev
              : [...prev, { path: event.path, category: event.category }],
          )
          break

        case 'validation_check':
          setValidationChecks((prev) => {
            const updated = [...prev]
            const idx = updated.findIndex((c) => c.name === event.name)
            if (idx === -1) {
              updated.push({ name: event.name, status: event.status, errors: event.errors })
            } else {
              updated[idx] = { name: event.name, status: event.status, errors: event.errors }
            }
            return updated
          })
          break

        case 'sandbox_ready':
          onSandboxReady?.(event.sandboxId)
          break

        // ── Single Orchestrator (AgentStreamEvent) ──────────────────
        case 'thinking':
          // Handled in parseSSEBuffer's onChatText callback
          break

        case 'tool_start': {
          if (INTERNAL_TOOLS.has(event.tool)) break

          // Extract file path from tool args
          const args = event.args as Record<string, unknown> | undefined
          const filePath = (args?.path as string) ?? (args?.filePath as string) ?? undefined

          const stepId = `${event.tool}-${now}-${toolStepCounter.current++}`
          setToolSteps((prev) => [
            ...prev,
            {
              id: stepId,
              tool: event.tool,
              label: event.label ?? event.tool,
              status: 'running',
              filePath,
              startedAt: now,
              turnId: currentTurnId.current,
            },
          ])
          break
        }

        case 'tool_complete': {
          if (INTERNAL_TOOLS.has(event.tool)) break

          setToolSteps((prev) => {
            // Find the last running step for this tool
            const idx = prev.findLastIndex((s) => s.tool === event.tool && s.status === 'running')
            if (idx < 0) return prev
            const updated = [...prev]
            updated[idx] = {
              ...updated[idx],
              status: event.success ? 'complete' : 'error',
              result: event.result,
              durationMs: event.durationMs,
              filePath: event.filePath ?? updated[idx].filePath,
              oldContent: event.oldContent,
              newContent: event.newContent,
            }
            return updated
          })
          break
        }

        case 'done':
          if (event.success) {
            setGenerationStatus('complete')
            setDoneSummary(event.summary)
            onGenerationComplete?.()
            if (event.sandboxId) {
              onSandboxReady?.(event.sandboxId)
            }
          } else {
            setGenerationStatus('error')
            setDoneSummary(event.summary)
          }
          break

        case 'agent_error':
          setGenerationStatus('error')
          setDoneSummary(event.message)
          break

        case 'package_installed':
          break
      }
    },
    [onGenerationComplete, onSandboxReady, pushTimeline, updateTimeline],
  )

  const parseSSEBuffer = useCallback(
    (
      buffer: string,
      onChatText: ((text: string) => void) | null,
      onGenerationEvent: ((event: StreamEvent) => void) | null,
    ): string => {
      const events = buffer.split('\n\n')
      const remainder = events.pop() || ''

      for (const eventText of events) {
        if (!eventText.trim() || !eventText.startsWith('data: ')) continue
        try {
          const event = JSON.parse(eventText.replace(/^data: /, '')) as StreamEvent

          // Pipe thinking text to the assistant message bubble
          if (onChatText && event.type === 'thinking') {
            onChatText(event.content)
          }

          // Legacy: pipe analyst/supervisor progress to chat text
          if (
            onChatText &&
            event.type === 'agent_progress' &&
            (event.agentId === 'analyst' || event.agentId === 'supervisor')
          ) {
            onChatText(event.message)
          }

          if (onGenerationEvent) {
            onGenerationEvent(event)
          }
        } catch {
          // skip malformed events
        }
      }

      return remainder
    },
    [],
  )

  const sendChatMessage = useCallback(
    async (text: string) => {
      if (chatStatus === 'streaming') return

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      }
      setSessionMessages((prev) => [...prev, userMessage])
      setChatStatus('streaming')
      setChatError(null)
      setGenerationStatus('generating')
      setDoneSummary(undefined)
      setGenerationFiles([])
      setTimelineEvents([])
      setBuildErrors([])
      setPageProgress([])
      setFileAssembly([])
      setValidationChecks([])

      const assistantId = `assistant-${Date.now()}`
      currentTurnId.current = assistantId
      setSessionMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant' as const, content: '' },
      ])

      let fullText = ''
      abortControllerRef.current?.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      const endpoint = selectedElement ? '/api/agent/edit' : '/api/agent'
      const body = selectedElement
        ? { message: text, projectId, targetElement: selectedElement, model }
        : { message: text, projectId, model }

      try {
        const response = await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortController.signal,
        })

        if (!response.ok || !response.body) {
          if (response.status === 402) {
            const errorData = await response.json()
            setChatError(
              new Error(`Out of credits. ${errorData.credits_remaining ?? 0} remaining.`),
            )
            setSessionMessages((prev) => prev.filter((m) => m.id !== assistantId))
            setChatStatus('ready')
            setGenerationStatus('error')
            return
          }
          throw new Error(`Request failed: ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            buffer = parseSSEBuffer(
              buffer,
              (delta: string) => {
                fullText += delta
                const snapshot = fullText
                setSessionMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: snapshot } : m)),
                )
              },
              handleGenerationEvent,
            )
          }
        } finally {
          reader.releaseLock()
        }

        if (selectedElement) {
          onEditComplete?.()
        }
        queryClient.invalidateQueries({ queryKey: ['project-conversation', projectId] })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (import.meta.env.DEV) console.error('[builder-chat] sendChatMessage error:', err)
        setChatError(err instanceof Error ? err : new Error('Chat failed'))
        setSessionMessages((prev) =>
          prev.filter((m) => m.id !== assistantId || m.content.length > 0),
        )
      } finally {
        setChatStatus('ready')
      }
    },
    [
      projectId,
      model,
      chatStatus,
      parseSSEBuffer,
      handleGenerationEvent,
      selectedElement,
      onEditComplete,
      queryClient,
    ],
  )

  useEffect(() => {
    sendChatMessageRef.current = sendChatMessage
  }, [sendChatMessage])

  const addSystemMessage = useCallback((content: string) => {
    const msg: ChatMessage = {
      id: `system-${Date.now()}`,
      role: 'assistant',
      content,
    }
    setSessionMessages((prev) => [...prev, msg])
  }, [])

  useEffect(() => {
    if (!initialPrompt) return
    const timer = setTimeout(() => {
      if (hasAutoSubmitted.current) return
      hasAutoSubmitted.current = true
      sendChatMessageRef.current(initialPrompt)
    }, 100)
    return () => clearTimeout(timer)
  }, [initialPrompt])

  const handleSubmit = (message: { text?: string }, options: { model: string; mode: string }) => {
    if (!message.text?.trim()) return
    // mode will be used in Phase 2 (Plan Mode)
    setModel(options.model)
    sendChatMessage(message.text)
  }

  const handleSuggestionClick = (suggestion: string) => {
    sendChatMessage(suggestion)
  }

  const handleClarificationSubmit = useCallback(
    async (answersText: string) => {
      setPendingClarification(null)

      if (!resumeRunId) {
        sendChatMessage(answersText)
        return
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: answersText,
      }
      setSessionMessages((prev) => [...prev, userMessage])
      setChatStatus('streaming')

      const assistantId = `assistant-${Date.now()}`
      currentTurnId.current = assistantId
      setSessionMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

      abortControllerRef.current?.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const response = await apiFetch('/api/agent/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: resumeRunId, answers: answersText }),
          signal: abortController.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(`Resume failed: ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            buffer = parseSSEBuffer(buffer, null, handleGenerationEvent)
          }
        } finally {
          reader.releaseLock()
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setChatError(err instanceof Error ? err : new Error('Resume failed'))
        setSessionMessages((prev) =>
          prev.filter((m) => m.id !== assistantId || m.content.length > 0),
        )
      } finally {
        setChatStatus('ready')
        setResumeRunId(null)
      }
    },
    [resumeRunId, parseSSEBuffer, handleGenerationEvent, sendChatMessage],
  )

  const handlePlanApprove = useCallback(async () => {
    if (!planRunId) return
    setPendingPlan(null)

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const response = await apiFetch('/api/agent/approve-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: planRunId }),
        signal: abortController.signal,
      })

      if (!response.ok) throw new Error(`Plan approval failed: ${response.status}`)
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sseBuffer += decoder.decode(value, { stream: true })
        sseBuffer = parseSSEBuffer(sseBuffer, null, handleGenerationEvent)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Plan approval error:', err)
      }
    } finally {
      setPlanRunId(null)
    }
  }, [planRunId, parseSSEBuffer, handleGenerationEvent])

  // Merge persisted + session tool steps.
  // Session steps have richer data (oldContent/newContent for diffs) so they take priority.
  // Deduplicate by semantic identity: tool + filePath + turnId.
  const allToolSteps = useMemo(() => {
    if (toolSteps.length === 0) return persistedToolSteps
    if (persistedToolSteps.length === 0) return toolSteps

    // Build a set of session step signatures to detect overlapping persisted steps
    const sessionKeys = new Set(
      toolSteps.map((s) => `${s.turnId ?? ''}:${s.tool}:${s.filePath ?? ''}:${s.label}`),
    )

    // Keep persisted steps that DON'T overlap with session steps (i.e. from older turns)
    const uniquePersisted = persistedToolSteps.filter(
      (s) => !sessionKeys.has(`${s.turnId ?? ''}:${s.tool}:${s.filePath ?? ''}:${s.label}`),
    )

    return [...uniquePersisted, ...toolSteps]
  }, [persistedToolSteps, toolSteps])

  const hasFiles = generationFiles.length > 0
  const showTimeline =
    generationStatus === 'generating' || timelineEvents.length > 0 || allToolSteps.length > 0

  return {
    // State
    model,
    setModel,
    generationStatus,
    doneSummary,
    generationFiles,
    buildErrors,
    pageProgress,
    fileAssembly,
    validationChecks,
    timelineEvents,
    toolSteps: allToolSteps,
    pendingClarification,
    pendingPlan,
    userCredits,
    messages,
    chatStatus,
    chatError,
    hasFiles,
    showTimeline,

    // Actions
    sendMessage: sendChatMessage,
    addSystemMessage,
    handleStop,
    handleClarificationSubmit,
    handlePlanApprove,
    handleSubmit,
    handleSuggestionClick,
  }
}
