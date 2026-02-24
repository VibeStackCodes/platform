'use client'

import {
  Bot,
  CheckCircle2,
  CircleCheck,
  Loader2,
  Rocket,
} from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/utils'
import { supabase } from '@/lib/supabase-browser'
import { useAuth } from '@/lib/auth'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input'
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
  FileTreeIcon,
  FileTreeName,
} from '@/components/ai-elements/file-tree'
import {
  StackTrace,
  StackTraceActions,
  StackTraceContent,
  StackTraceCopyButton,
  StackTraceError,
  StackTraceErrorMessage,
  StackTraceErrorType,
  StackTraceExpandButton,
  StackTraceFrames,
  StackTraceHeader,
} from '@/components/ai-elements/stack-trace'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { ActionCard, ActionCardContent, ActionCardHeader, ActionCardTabs } from '@/components/ai-elements/action-card'
import { ThinkingCard } from '@/components/ai-elements/thinking-card'
import { OperationSummaryCard } from '@/components/ai-elements/operation-summary-card'
import {
  TestResults,
  TestResultsContent,
  TestResultsHeader,
  TestResultsProgress,
  TestResultsSummary,
  Test,
} from '@/components/ai-elements/test-results'
import { PlanApprovalCard } from '@/components/ai-elements/plan-approval-card'
import { ClarificationQuestions } from '@/components/clarification-questions'
import { CreditDisplay } from '@/components/credit-display'
import { PromptBar } from '@/components/prompt-bar'
import { ThemeTokensCard } from '@/components/ai-elements/theme-tokens-card'
import type { ThemeTokens as ThemeTokensCardTokens } from '@/components/ai-elements/theme-tokens-card'
import { ArchitectureCard } from '@/components/ai-elements/architecture-card'
import { PageProgressCard } from '@/components/ai-elements/page-progress-card'
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
const AGENT_CARD_CONFIG: Record<string, { icon: string; runningLabel: string; completeLabel?: string }> = {
  analyst: { icon: 'brain', runningLabel: 'Analyzing...', completeLabel: 'Analyzed requirements' },
  architect: { icon: 'sparkles', runningLabel: 'Designing architecture...', completeLabel: 'Designed app architecture' },
  frontend: { icon: 'code', runningLabel: 'Generating pages...', completeLabel: 'Generated pages' },
  backend: { icon: 'package', runningLabel: 'Assembling files...', completeLabel: 'Assembled files' },
  qa: { icon: 'shield', runningLabel: 'Validating build...', completeLabel: 'Validation complete' },
}

/** Renders clarification answers as a structured list, or plain text for normal messages */
function ClarificationAnswersOrText({ content }: { content: string }) {
  const lines = content.split('\n').filter(Boolean)
  const isClarificationAnswers =
    lines.length >= 2 && lines.every((l) => l.includes('?:') || l.includes(': (skipped)'))

  if (!isClarificationAnswers) {
    return <div className="whitespace-pre-wrap">{content}</div>
  }

  const entries = lines.map((line) => {
    const colonIdx = line.indexOf(':')
    const question = line.slice(0, colonIdx).replace(/\?$/, '').trim()
    const answer = line.slice(colonIdx + 1).trim()
    const skipped = answer === '(skipped)'
    return { question, answer, skipped }
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CircleCheck className="h-3.5 w-3.5" />
        Preferences
      </div>
      <div className="grid gap-1.5">
        {entries.map((e) => (
          <div key={e.question} className="flex items-baseline gap-2 text-sm">
            <span className="text-muted-foreground shrink-0">{e.question}:</span>
            <span className={e.skipped ? 'italic text-muted-foreground/60' : 'font-medium'}>
              {e.answer}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Custom message type
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface BuilderChatProps {
  projectId: string
  initialPrompt?: string
  onGenerationComplete?: () => void
  onSandboxReady?: (sandboxId: string) => void
  selectedElement?: ElementContext | null
  onEditComplete?: () => void
}

const SUGGESTIONS = [
  'A todo app with authentication',
  'A blog with markdown editor',
  'An e-commerce store with Stripe',
  'A real-time chat application',
]


/** Build a hierarchical tree from flat file paths for FileTree rendering */
interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
  status?: 'pending' | 'generating' | 'complete' | 'error'
  lines?: number
}

function buildFileTree(
  files: { path: string; status: 'pending' | 'generating' | 'complete' | 'error'; lines?: number }[],
): TreeNode[] {
  const root: TreeNode[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const fullPath = parts.slice(0, i + 1).join('/')

      const existing = current.find((n) => n.name === part)
      if (existing) {
        if (isLast) {
          existing.status = file.status
          existing.lines = file.lines
        }
        current = existing.children
      } else {
        const node: TreeNode = {
          name: part,
          path: fullPath,
          isDir: !isLast,
          children: [],
          status: isLast ? file.status : undefined,
          lines: isLast ? file.lines : undefined,
        }
        current.push(node)
        current = node.children
      }
    }
  }

  return root
}

/** Renders generated files as a collapsible tree */
function GeneratedFileTree({
  files,
}: {
  files: { path: string; status: 'pending' | 'generating' | 'complete' | 'error'; lines?: number }[]
}) {
  const tree = useMemo(() => buildFileTree(files), [files])
  const defaultExpanded = useMemo(
    () => new Set(tree.filter((n) => n.isDir).map((n) => n.path)),
    [tree],
  )

  function renderNode(node: TreeNode) {
    if (node.isDir) {
      return (
        <FileTreeFolder key={node.path} path={node.path} name={node.name}>
          {node.children.map(renderNode)}
        </FileTreeFolder>
      )
    }

    const statusIcon =
      node.status === 'complete' ? (
        <CheckCircle2 className="size-3.5 text-green-500" />
      ) : node.status === 'generating' ? (
        <Loader2 className="size-3.5 animate-spin text-blue-400" />
      ) : node.status === 'error' ? (
        <span className="size-3.5 text-red-500">!</span>
      ) : (
        <span className="size-3.5 text-muted-foreground/50" />
      )

    return (
      <FileTreeFile key={node.path} path={node.path} name={node.name}>
        <span className="size-4" />
        <FileTreeIcon>{statusIcon}</FileTreeIcon>
        <FileTreeName
          className={node.status === 'complete' ? 'text-muted-foreground' : 'text-foreground'}
        >
          {node.name}
          {node.lines !== undefined && (
            <span className="ml-1 text-xs text-muted-foreground">({node.lines}L)</span>
          )}
        </FileTreeName>
      </FileTreeFile>
    )
  }

  return (
    <FileTree defaultExpanded={defaultExpanded} className="border-0 bg-transparent text-xs">
      {tree.map(renderNode)}
    </FileTree>
  )
}

export function BuilderChat({
  projectId,
  initialPrompt,
  onGenerationComplete,
  onSandboxReady,
  selectedElement,
  onEditComplete,
}: BuilderChatProps) {
  const [model, setModel] = useState('gpt-5.2-codex')
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'generating' | 'complete' | 'error'
  >('idle')

  const [generationFiles, setGenerationFiles] = useState<
    { path: string; status: 'pending' | 'generating' | 'complete' | 'error'; lines?: number }[]
  >([])
  const [buildErrors, setBuildErrors] = useState<BuildError[]>([])

  const [pageProgress, setPageProgress] = useState<PageProgressEntry[]>([])
  const [fileAssembly, setFileAssembly] = useState<FileAssemblyEntry[]>([])
  const [validationChecks, setValidationChecks] = useState<ValidationCheckEntry[]>([])

  const [timelineEvents, setTimelineEvents] = useState<TimelineEntry[]>([])

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

  const { persistedMessages, persistedTimeline, persistedValidation, persistedPageProgress, persistedFileAssembly } = useMemo(() => {
    if (!conversationEvents?.length) {
      return {
        persistedMessages: [] as ChatMessage[],
        persistedTimeline: [] as TimelineEntry[],
        persistedValidation: [] as Array<{ name: string; status: string; errors?: string[] }>,
        persistedPageProgress: [] as Array<Record<string, unknown>>,
        persistedFileAssembly: [] as Array<{ path: string; category: string }>,
      }
    }

    const messages: ChatMessage[] = []
    const timeline: TimelineEntry[] = []
    const validation: Array<{ name: string; status: string; errors?: string[] }> = []
    const pageProgressArr: Array<Record<string, unknown>> = []
    const fileAssemblyArr: Array<{ path: string; category: string }> = []

    for (const evt of conversationEvents) {
      const p = Array.isArray(evt.parts) ? evt.parts[0] : evt.parts
      switch (evt.type) {
        case 'message':
          messages.push({
            id: evt.id,
            role: (evt.role === 'system' ? 'assistant' : evt.role) as 'user' | 'assistant',
            content: (Array.isArray(evt.parts) ? evt.parts : [])
              .map((part: Record<string, unknown>) => (part.text as string) || '')
              .filter(Boolean)
              .join(''),
          })
          break
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
            timeline[idx] = { ...agentEntry, status: 'complete' as const, durationMs: data.durationMs as number }
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
          const idx = timeline.findLastIndex((e) => e.type === 'agent' && e.agent.agentId === 'architect')
          if (idx >= 0) {
            const agentEntry = timeline[idx] as Extract<TimelineEntry, { type: 'agent' }>
            timeline[idx] = { ...agentEntry, designTokens: data.tokens as DesignTokensEvent['tokens'] }
          }
          break
        }
        case 'architecture_ready': {
          const data = p as Record<string, unknown>
          const idx = timeline.findLastIndex((e) => e.type === 'agent' && e.agent.agentId === 'architect')
          if (idx >= 0) {
            const agentEntry = timeline[idx] as Extract<TimelineEntry, { type: 'agent' }>
            timeline[idx] = { ...agentEntry, architecture: data.spec as ArchitectureReadyEvent['spec'] }
          }
          break
        }
        case 'plan_ready': {
          const data = p as Record<string, unknown>
          const idx = timeline.findLastIndex((e) => e.type === 'agent' && e.agent.agentId === 'analyst')
          if (idx >= 0) {
            const agentEntry = timeline[idx] as Extract<TimelineEntry, { type: 'agent' }>
            timeline[idx] = { ...agentEntry, plan: data.plan as PlanReadyEvent['plan'] }
          }
          break
        }
        case 'validation_check': {
          const data = p as Record<string, unknown>
          const existing = validation.findIndex((v) => v.name === data.name)
          if (existing >= 0) validation[existing] = data as { name: string; status: string; errors?: string[] }
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
      }
    }

    return {
      persistedMessages: messages,
      persistedTimeline: timeline,
      persistedValidation: validation,
      persistedPageProgress: pageProgressArr,
      persistedFileAssembly: fileAssemblyArr,
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
    if (persistedTimeline.some((e) => e.type === 'complete')) {
      setGenerationStatus('complete')
    } else if (persistedTimeline.some((e) => e.type === 'error')) {
      setGenerationStatus('error')
    }
  }, [persistedTimeline, persistedValidation, persistedPageProgress, persistedFileAssembly])

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
          if (event.runId) setPlanRunId(event.runId)
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
              return [...prev, {
                fileName: event.fileName,
                route: event.route,
                componentName: event.componentName,
                status: 'complete' as const,
                lineCount: event.lineCount,
                code: event.code,
              }]
            }
            const updated = [...prev]
            updated[idx] = { ...updated[idx], status: 'complete' as const, lineCount: event.lineCount, code: event.code }
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
      setGenerationFiles([])
      setTimelineEvents([])
      setBuildErrors([])
      setPageProgress([])
      setFileAssembly([])
      setValidationChecks([])

      const assistantId = `assistant-${Date.now()}`
      setSessionMessages((prev) => [...prev, { id: assistantId, role: 'assistant' as const, content: '' }])

      let fullText = ''
      abortControllerRef.current?.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      const endpoint = selectedElement ? '/api/agent/edit' : '/api/agent'
      const body = selectedElement
        ? { message: text, projectId, targetElement: selectedElement, model }
        : { message: text, projectId, model }

      try {
        console.log('[builder-chat] Sending to', endpoint, body)
        const response = await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortController.signal,
        })
        console.log('[builder-chat] Response status:', response.status)

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
        console.error('[builder-chat] sendChatMessage error:', err)
        setChatError(err instanceof Error ? err : new Error('Chat failed'))
        setSessionMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content.length > 0))
      } finally {
        setChatStatus('ready')
      }
    },
    [projectId, model, chatStatus, parseSSEBuffer, handleGenerationEvent, selectedElement, onEditComplete, queryClient],
  )

  useEffect(() => { sendChatMessageRef.current = sendChatMessage }, [sendChatMessage])

  useEffect(() => {
    if (!initialPrompt) return
    const timer = setTimeout(() => {
      if (hasAutoSubmitted.current) return
      hasAutoSubmitted.current = true
      console.log('[builder-chat] Auto-submitting initial prompt:', initialPrompt.slice(0, 50))
      sendChatMessageRef.current(initialPrompt)
    }, 100)
    return () => clearTimeout(timer)
  }, [initialPrompt])

  const handleSubmit = async (
    message: PromptInputMessage,
    options: { model: string; mode: 'edit' | 'chat' | 'plan' },
  ) => {
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
        setSessionMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content.length > 0))
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

  const hasFiles = generationFiles.length > 0
  const showTimeline = generationStatus === 'generating' || timelineEvents.length > 0

  return (
    <div className="flex h-full flex-col">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 && !showTimeline ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <ConversationEmptyState
                icon={<Bot className="size-12" />}
                title="Start building"
                description="Describe what you want to build and I'll help you refine the idea before generating code"
              />
              <Suggestions>
                {SUGGESTIONS.map((s) => (
                  <Suggestion key={s} suggestion={s} onClick={handleSuggestionClick} />
                ))}
              </Suggestions>
            </div>
          ) : (
            <>
              {/* Chat Messages */}
              {messages.map((message) => (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.role === 'user' ? (
                      <ClarificationAnswersOrText content={message.content} />
                    ) : (
                      <Suspense
                        fallback={
                          <div className="text-sm text-muted-foreground animate-pulse">
                            Loading response...
                          </div>
                        }
                      >
                        <MessageResponse>{message.content}</MessageResponse>
                      </Suspense>
                    )}
                  </MessageContent>
                </Message>
              ))}

              {/* Streaming indicator */}
              {(() => {
                const lastMessage = messages[messages.length - 1]
                const showThinking =
                  chatStatus === 'streaming' &&
                  lastMessage?.role === 'assistant' &&
                  !lastMessage?.content
                return showThinking ? (
                  <div className="mx-4 my-2 text-sm text-muted-foreground animate-pulse">
                    {selectedElement ? `Editing <${selectedElement.tagName}>...` : 'Thinking...'}
                  </div>
                ) : null
              })()}

              {/* Chat error */}
              {chatError && (
                <div
                  className="mx-4 my-2 rounded-md bg-red-900/50 p-3 text-sm text-red-300"
                  data-testid="chat-error"
                >
                  Chat error: {chatError.message}
                </div>
              )}

              {/* Inline Timeline */}
              {showTimeline && (
                <div className="space-y-3 px-4 py-3">
                  {timelineEvents.map((entry) => {
                    switch (entry.type) {
                      case 'agent': {
                        const isComplete = entry.status === 'complete'
                        const agentId = entry.agent.agentId
                        const cardKey = `agent-${agentId}-${entry.ts}`
                        const config = AGENT_CARD_CONFIG[agentId]
                        const cardStatus = isComplete ? 'complete' as const : 'running' as const

                        // Analyst → ThinkingCard (+ optional clarification questions)
                        if (agentId === 'analyst') {
                          const planText = entry.plan
                            ? [
                                entry.plan.appName && `**${entry.plan.appName as string}**`,
                                entry.plan.appDescription as string | undefined,
                                entry.plan.prd as string | undefined,
                              ]
                                .filter(Boolean)
                                .join('\n\n')
                            : undefined

                          return (
                            <div key={cardKey} className="space-y-3">
                              <ThinkingCard
                                startedAt={entry.ts}
                                status={isComplete ? 'complete' : 'thinking'}
                                durationMs={entry.durationMs}
                              >
                                {planText}
                              </ThinkingCard>
                              {entry.clarificationQuestions && pendingClarification && (
                                <ClarificationQuestions
                                  questions={entry.clarificationQuestions}
                                  onSubmit={handleClarificationSubmit}
                                />
                              )}
                            </div>
                          )
                        }

                        // Backend → OperationSummaryCard
                        if (agentId === 'backend') {
                          return (
                            <OperationSummaryCard
                              key={cardKey}
                              files={fileAssembly}
                              status={cardStatus}
                              durationMs={entry.durationMs}
                            />
                          )
                        }

                        // Architect → ActionCard with Details + Preview tabs
                        if (agentId === 'architect') {
                          const hasTokens = !!entry.designTokens
                          const hasArch = !!entry.architecture
                          const colors = entry.designTokens?.colors
                          const architectLabel = isComplete
                            ? (config?.completeLabel ?? 'Designed app architecture')
                            : (config?.runningLabel ?? 'Designing architecture...')
                          return (
                            <div key={cardKey} className="space-y-3">
                              <ActionCard>
                                <ActionCardHeader
                                  icon={config?.icon ?? 'sparkles'}
                                  label={architectLabel}
                                  status={cardStatus}
                                  durationMs={entry.durationMs}
                                />
                                {(hasTokens || hasArch) && (
                                  <ActionCardTabs>
                                    <ActionCardContent tab="details">
                                      <div className="space-y-3">
                                        {hasTokens && (
                                          <ThemeTokensCard
                                            tokens={entry.designTokens as unknown as ThemeTokensCardTokens}
                                          />
                                        )}
                                        {hasArch && <ArchitectureCard spec={entry.architecture!} />}
                                      </div>
                                    </ActionCardContent>
                                    {colors && (
                                      <ActionCardContent tab="preview">
                                        <div className="flex flex-wrap gap-2">
                                          {Object.entries(colors).map(([name, value]) => (
                                            <div key={name} className="flex items-center gap-1.5">
                                              <div
                                                className="size-4 rounded-full border border-border"
                                                style={{ backgroundColor: value }}
                                                title={value}
                                              />
                                              <span className="text-xs text-muted-foreground capitalize">
                                                {name.replace(/([A-Z])/g, ' $1').toLowerCase()}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </ActionCardContent>
                                    )}
                                  </ActionCardTabs>
                                )}
                              </ActionCard>
                              {entry.plan && pendingPlan && (
                                <PlanApprovalCard
                                  plan={entry.plan}
                                  onApprove={handlePlanApprove}
                                  status={pendingPlan ? 'pending' : 'approved'}
                                />
                              )}
                            </div>
                          )
                        }

                        // Frontend → ActionCard with PageProgressCard
                        if (agentId === 'frontend') {
                          const completedPages = pageProgress.filter((p) => p.status === 'complete').length
                          const frontendLabel = isComplete
                            ? `Generated ${completedPages} page${completedPages !== 1 ? 's' : ''}`
                            : (config?.runningLabel ?? 'Generating pages...')
                          return (
                            <ActionCard key={cardKey}>
                              <ActionCardHeader
                                icon={config?.icon ?? 'code'}
                                label={frontendLabel}
                                status={cardStatus}
                                durationMs={entry.durationMs}
                              />
                              {pageProgress.length > 0 && (
                                <ActionCardTabs>
                                  <ActionCardContent tab="details">
                                    <PageProgressCard pages={pageProgress} className="border-0 shadow-none p-0" />
                                  </ActionCardContent>
                                </ActionCardTabs>
                              )}
                            </ActionCard>
                          )
                        }

                        // QA → ActionCard with TestResults
                        if (agentId === 'qa') {
                          const passed = validationChecks.filter((c) => c.status === 'passed').length
                          const failed = validationChecks.filter((c) => c.status === 'failed').length
                          const total = validationChecks.length
                          const qaLabel = isComplete
                            ? (failed > 0 ? 'Validation failed' : 'Validation passed')
                            : (config?.runningLabel ?? 'Validating...')
                          return (
                            <ActionCard key={cardKey}>
                              <ActionCardHeader
                                icon={config?.icon ?? 'shield'}
                                label={qaLabel}
                                status={cardStatus}
                                durationMs={entry.durationMs}
                              />
                              {validationChecks.length > 0 && (
                                <ActionCardTabs>
                                  <ActionCardContent tab="details">
                                    <TestResults summary={{ passed, failed, skipped: 0, total }}>
                                      <TestResultsHeader>
                                        <TestResultsSummary />
                                      </TestResultsHeader>
                                      <TestResultsProgress />
                                      <TestResultsContent>
                                        {validationChecks.map((check) => (
                                          <Test
                                            key={check.name}
                                            name={check.name}
                                            status={check.status === 'running' ? 'running' : check.status === 'failed' ? 'failed' : 'passed'}
                                          />
                                        ))}
                                      </TestResultsContent>
                                    </TestResults>
                                  </ActionCardContent>
                                </ActionCardTabs>
                              )}
                            </ActionCard>
                          )
                        }

                        // Legacy Pipeline A (codegen)
                        if (agentId === 'codegen' && hasFiles) {
                          return (
                            <ActionCard key={cardKey}>
                              <ActionCardHeader
                                icon="code"
                                label={isComplete ? 'Generated files' : 'Generating files...'}
                                status={cardStatus}
                                durationMs={entry.durationMs}
                              />
                              <ActionCardTabs>
                                <ActionCardContent tab="details">
                                  <GeneratedFileTree files={generationFiles} />
                                </ActionCardContent>
                              </ActionCardTabs>
                            </ActionCard>
                          )
                        }

                        // Generic agents (provisioner, repair, reviewer, etc.)
                        {
                          const genericLabel = isComplete
                            ? (config?.completeLabel ?? entry.agent.agentName)
                            : (config?.runningLabel ?? `${entry.agent.agentName}...`)
                          return (
                            <ActionCard key={cardKey}>
                              <ActionCardHeader
                                icon={config?.icon ?? 'sparkles'}
                                label={genericLabel}
                                status={cardStatus}
                                durationMs={entry.durationMs}
                              />
                              {entry.progressMessages && entry.progressMessages.length > 0 && (
                                <ActionCardTabs>
                                  <ActionCardContent tab="details">
                                    <div className="space-y-1.5 text-sm text-muted-foreground">
                                      {entry.progressMessages.map((msg) => (
                                        <div key={msg} className="flex items-center gap-2">
                                          <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
                                          <span>{msg}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </ActionCardContent>
                                </ActionCardTabs>
                              )}
                            </ActionCard>
                          )
                        }
                      }

                      case 'error':
                        return (
                          <StackTrace
                            key={`error-${entry.ts}`}
                            trace={entry.error}
                            defaultOpen
                          >
                            <StackTraceHeader>
                              <StackTraceError>
                                <StackTraceErrorType>Pipeline Error</StackTraceErrorType>
                                <StackTraceErrorMessage>
                                  {entry.error}
                                </StackTraceErrorMessage>
                              </StackTraceError>
                              <StackTraceActions>
                                <StackTraceCopyButton />
                                <StackTraceExpandButton />
                              </StackTraceActions>
                            </StackTraceHeader>
                            <StackTraceContent>
                              <StackTraceFrames showInternalFrames={false} />
                            </StackTraceContent>
                          </StackTrace>
                        )

                      case 'complete':
                        return (
                          <div
                            key={`complete-${entry.ts}`}
                            className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400"
                          >
                            <Rocket className="size-4" />
                            <span>Your app is ready!</span>
                          </div>
                        )

                      default:
                        return null
                    }
                  })}

                  {/* Build Errors (outside timeline entries) */}
                  {buildErrors.length > 0 && (
                    <div className="space-y-2">
                      {buildErrors.map((err) => (
                        <StackTrace
                          key={`${err.file}-${err.message}`}
                          trace={err.raw}
                          defaultOpen={false}
                        >
                          <StackTraceHeader>
                            <StackTraceError>
                              <StackTraceErrorType>Build Error</StackTraceErrorType>
                              <StackTraceErrorMessage>
                                {err.message}
                              </StackTraceErrorMessage>
                            </StackTraceError>
                            <StackTraceActions>
                              <StackTraceCopyButton />
                              <StackTraceExpandButton />
                            </StackTraceActions>
                          </StackTraceHeader>
                          <StackTraceContent>
                            <StackTraceFrames showInternalFrames={false} />
                          </StackTraceContent>
                        </StackTrace>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-4">
        {userCredits && (
          <div className="mb-2 flex items-center justify-between">
            <CreditDisplay
              remaining={userCredits.credits_remaining}
              monthly={userCredits.credits_monthly}
              plan={userCredits.plan}
              resetAt={userCredits.credits_reset_at}
            />
          </div>
        )}
        <PromptBar
          onSubmit={handleSubmit}
          onStop={handleStop}
          placeholder="Describe what you want to build..."
          status={chatStatus === 'streaming' ? 'streaming' : 'ready'}
        />
      </div>
    </div>
  )
}
