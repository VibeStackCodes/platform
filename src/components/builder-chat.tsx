'use client'

import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cog,
  Loader2,
  Rocket,
} from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Agent, AgentContent } from '@/components/ai-elements/agent'
import {
  TestResults,
  TestResultsContent,
  TestResultsHeader,
  TestResultsProgress,
  TestResultsSummary,
  Test,
} from '@/components/ai-elements/test-results'
import { ClarificationQuestions } from '@/components/clarification-questions'
import { CreditDisplay } from '@/components/credit-display'
import { PromptBar } from '@/components/prompt-bar'
import { ThemeTokensCard } from '@/components/ai-elements/theme-tokens-card'
import type { ThemeTokens as ThemeTokensCardTokens } from '@/components/ai-elements/theme-tokens-card'
import { ArchitectureCard } from '@/components/ai-elements/architecture-card'
import { PageProgressCard } from '@/components/ai-elements/page-progress-card'
import { FileAssemblyCard } from '@/components/ai-elements/file-assembly-card'
import type {
  BuildError,
  ClarificationQuestion,
  ElementContext,
  FileAssemblyEntry,
  PageProgressEntry,
  StreamEvent,
  TimelineEntry,
  ValidationCheckEntry,
} from '@/lib/types'

// Custom message type — replaces UIMessage from Vercel AI SDK
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface BuilderChatProps {
  projectId: string
  initialPrompt?: string
  initialMessages?: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    parts: Array<Record<string, unknown>>
  }>
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

/** Format milliseconds as human-readable duration */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = (ms / 1000).toFixed(1)
  return `${secs}s`
}

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
  initialMessages,
  onGenerationComplete,
  onSandboxReady,
  selectedElement,
  onEditComplete,
}: BuilderChatProps) {
  const [model, setModel] = useState('gpt-5.2')
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'generating' | 'complete' | 'error'
  >('idle')

  // File queue — tracked separately for incremental updates
  const [generationFiles, setGenerationFiles] = useState<
    { path: string; status: 'pending' | 'generating' | 'complete' | 'error'; lines?: number }[]
  >([])
  const [buildErrors, setBuildErrors] = useState<BuildError[]>([])

  // Pipeline B state — live tracking during generation
  const [pageProgress, setPageProgress] = useState<PageProgressEntry[]>([])
  const [fileAssembly, setFileAssembly] = useState<FileAssemblyEntry[]>([])
  const [validationChecks, setValidationChecks] = useState<ValidationCheckEntry[]>([])

  // Unified timeline — ordered array of all pipeline events
  const [timelineEvents, setTimelineEvents] = useState<TimelineEntry[]>([])

  const [pendingClarification, setPendingClarification] = useState<ClarificationQuestion[] | null>(
    null,
  )
  const [resumeRunId, setResumeRunId] = useState<string | null>(null)
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

  // Fetch credits on mount via Supabase browser client
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

  // Sync fetched credits into local state (SSE events update it later)
  useEffect(() => {
    if (creditsData) {
      setUserCredits(creditsData)
    }
  }, [creditsData])

  // Abort in-flight SSE streams on unmount
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

  // Custom state management — replaces useChat from @ai-sdk/react
  const [messages, setMessages] = useState<ChatMessage[]>(
    () =>
      initialMessages?.map((m) => ({
        id: m.id,
        role: (m.role === 'system' ? 'assistant' : m.role) as 'user' | 'assistant',
        content:
          m.parts
            ?.map((p) => (p as Record<string, unknown>).text || '')
            .filter(Boolean)
            .join('') || '',
      })) ?? [],
  )
  const [chatStatus, setChatStatus] = useState<'ready' | 'streaming'>('ready')
  const [chatError, setChatError] = useState<Error | null>(null)

  /** Push a timeline entry with automatic timestamp */
  const pushTimeline = useCallback((entry: TimelineEntry) => {
    setTimelineEvents((prev) => [...prev, entry])
  }, [])

  /** Update an existing timeline entry by finding it via predicate */
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
          // Store progress messages on the agent's timeline entry for card rendering
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
          // Attach plan to the analyst agent card
          updateTimeline(
            (e) => e.type === 'agent' && e.agent.agentId === 'analyst',
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
          break

        case 'design_tokens':
          // Attach tokens to the designer agent card
          updateTimeline(
            (e) => e.type === 'agent' && e.agent.agentId === 'designer',
            (e) => ({ ...e, designTokens: event.tokens }),
          )
          break

        case 'architecture_ready':
          // Attach architecture to the architect agent card
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
              // Page wasn't added by page_generating (real mode) — add it directly
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

  /**
   * Parse an SSE buffer and process chat-relevant events.
   * Shared between sendChatMessage and handleStartGeneration.
   */
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

          // Chat-relevant: stream analyst/supervisor text into the assistant message
          if (
            onChatText &&
            event.type === 'agent_progress' &&
            (event.agentId === 'analyst' || event.agentId === 'supervisor')
          ) {
            onChatText(event.message)
          }

          // Everything else goes to the generation event handler
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

  /**
   * Send a chat message to /api/agent (or /api/agent/edit if an element is selected).
   */
  const sendChatMessage = useCallback(
    async (text: string) => {
      if (chatStatus === 'streaming') return

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      }
      setMessages((prev) => [...prev, userMessage])
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
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant' as const, content: '' }])

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
            setMessages((prev) => prev.filter((m) => m.id !== assistantId))
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
                setMessages((prev) =>
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
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        console.error('[builder-chat] sendChatMessage error:', err)
        setChatError(err instanceof Error ? err : new Error('Chat failed'))
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content.length > 0))
      } finally {
        setChatStatus('ready')
      }
    },
    [projectId, model, chatStatus, parseSSEBuffer, handleGenerationEvent, selectedElement, onEditComplete],
  )

  // Keep a ref to the latest sendChatMessage (avoids stale closure)
  useEffect(() => { sendChatMessageRef.current = sendChatMessage }, [sendChatMessage])

  // Auto-submit initial prompt — deferred to survive React 18 Strict Mode double-mount.
  // Strict Mode unmounts+remounts in dev, which aborts in-flight fetches via the cleanup effect.
  // By deferring with setTimeout, the first mount's timer is cleared on unmount, and the
  // second mount's timer fires successfully (hasAutoSubmitted is still false since we only set
  // it inside the callback).
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
    options: { model: string; webSearch: boolean },
  ) => {
    if (!message.text?.trim()) return
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
      setMessages((prev) => [...prev, userMessage])
      setChatStatus('streaming')

      const assistantId = `assistant-${Date.now()}`
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }])

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
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content.length > 0))
      } finally {
        setChatStatus('ready')
        setResumeRunId(null)
      }
    },
    [resumeRunId, parseSSEBuffer, handleGenerationEvent, sendChatMessage],
  )

  // Whether we should show the file queue (any file events have occurred)
  const hasFiles = generationFiles.length > 0

  // Whether pipeline is actively running (show timeline section)
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
              {/* ── Chat Messages ── */}
              {messages.map((message) => (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{message.content}</div>
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

              {/* Clarification Questions */}
              {pendingClarification && (
                <ClarificationQuestions
                  questions={pendingClarification}
                  onSubmit={handleClarificationSubmit}
                  disabled={chatStatus === 'streaming'}
                />
              )}

              {/* Chat error */}
              {chatError && (
                <div
                  className="mx-4 my-2 rounded-md bg-red-900/50 p-3 text-sm text-red-300"
                  data-testid="chat-error"
                >
                  Chat error: {chatError.message}
                </div>
              )}

              {/* ── Inline Timeline ── */}
              {showTimeline && (
                <div className="space-y-3 px-4 py-3">
                  {timelineEvents.map((entry) => {
                    switch (entry.type) {
                      case 'agent': {
                        const isComplete = entry.status === 'complete'
                        const agentId = entry.agent.agentId

                        // Build embedded content for this agent
                        const embeddedContent = (() => {
                          // Analyst → Plan card
                          if (agentId === 'analyst' && entry.plan) {
                            return (
                              <Plan defaultOpen>
                                <PlanHeader>
                                  <div>
                                    <PlanTitle>
                                      {(entry.plan.appName as string) || 'App Blueprint'}
                                    </PlanTitle>
                                    <PlanDescription>
                                      {(entry.plan.appDescription as string) ||
                                        (Array.isArray(entry.plan.tables) && entry.plan.tables.length > 0
                                          ? `${entry.plan.tables.length} tables`
                                          : 'Generation plan ready')}
                                    </PlanDescription>
                                  </div>
                                  <PlanAction>
                                    <PlanTrigger />
                                  </PlanAction>
                                </PlanHeader>
                                <PlanContent>
                                  <div className="space-y-2 text-sm text-muted-foreground">
                                    {entry.plan.appDescription && (
                                      <p>{entry.plan.appDescription as string}</p>
                                    )}
                                  </div>
                                </PlanContent>
                              </Plan>
                            )
                          }

                          // Designer → ThemeTokensCard
                          if (agentId === 'designer' && entry.designTokens) {
                            return (
                              <ThemeTokensCard
                                tokens={entry.designTokens as unknown as ThemeTokensCardTokens}
                              />
                            )
                          }

                          // Architect → ArchitectureCard
                          if (agentId === 'architect' && entry.architecture) {
                            return <ArchitectureCard spec={entry.architecture} />
                          }

                          // Frontend → PageProgressCard
                          if (agentId === 'frontend' && pageProgress.length > 0) {
                            return <PageProgressCard pages={pageProgress} className="border-0 shadow-none" />
                          }

                          // Backend → FileAssemblyCard (matches PageProgressCard style)
                          if (agentId === 'backend' && fileAssembly.length > 0) {
                            return <FileAssemblyCard files={fileAssembly} className="border-0 shadow-none" />
                          }

                          // QA → TestResults (matches Vercel AI Elements pattern)
                          if (agentId === 'qa' && validationChecks.length > 0) {
                            const passed = validationChecks.filter((c) => c.status === 'passed').length
                            const failed = validationChecks.filter((c) => c.status === 'failed').length
                            const total = validationChecks.length
                            return (
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
                            )
                          }

                          // Legacy Pipeline A fallback
                          if (agentId === 'codegen' && hasFiles) {
                            return <GeneratedFileTree files={generationFiles} />
                          }

                          // Generic progress messages (provisioner, repair, reviewer, etc.)
                          if (entry.progressMessages && entry.progressMessages.length > 0) {
                            return (
                              <div className="space-y-1.5 text-sm text-muted-foreground">
                                {entry.progressMessages.map((msg) => (
                                  <div key={msg} className="flex items-center gap-2">
                                    <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
                                    <span>{msg}</span>
                                  </div>
                                ))}
                              </div>
                            )
                          }

                          return null
                        })()

                        const hasContent = !!embeddedContent

                        return (
                          <Collapsible
                            key={`agent-${agentId}-${entry.ts}`}
                            defaultOpen={hasContent || !isComplete}
                          >
                            <Agent>
                              <CollapsibleTrigger className="group w-full text-left">
                                <div className="flex w-full items-center gap-2 p-3">
                                  {isComplete ? (
                                    <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                                  ) : (
                                    <Cog className="size-4 shrink-0 animate-spin text-muted-foreground" />
                                  )}
                                  <Bot className="size-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">
                                    {entry.agent.agentName}
                                  </span>
                                  {isComplete && entry.durationMs != null && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Clock className="size-3" />
                                      {formatDuration(entry.durationMs)}
                                    </span>
                                  )}
                                  <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <AgentContent>
                                  {embeddedContent}
                                </AgentContent>
                              </CollapsibleContent>
                            </Agent>
                          </Collapsible>
                        )
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
