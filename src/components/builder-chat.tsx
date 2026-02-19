'use client'

import { Bot, CheckCircle2 } from 'lucide-react'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/utils'
import { Checkpoint, CheckpointIcon, CheckpointTrigger } from '@/components/ai-elements/checkpoint'
import {
  Commit,
  CommitContent,
  CommitFile,
  CommitFileIcon,
  CommitFileInfo,
  CommitFilePath,
  CommitFileStatus,
  CommitFiles,
  CommitHash,
  CommitHeader,
  CommitInfo,
  CommitMessage,
} from '@/components/ai-elements/commit'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input'
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
} from '@/components/ai-elements/queue'
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
import { ClarificationQuestions } from '@/components/clarification-questions'
import { CreditDisplay } from '@/components/credit-display'
import { PromptBar } from '@/components/prompt-bar'
import type {
  BuildError,
  ChatPlan,
  CheckpointEvent,
  ClarificationQuestion,
  ElementContext,
  LayerCommitEvent,
  StreamEvent,
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
  selectedElement?: ElementContext | null
  onEditComplete?: () => void
}

const SUGGESTIONS = [
  'A todo app with authentication',
  'A blog with markdown editor',
  'An e-commerce store with Stripe',
  'A real-time chat application',
]

export function BuilderChat({
  projectId,
  initialPrompt,
  initialMessages,
  onGenerationComplete,
  selectedElement,
  onEditComplete,
}: BuilderChatProps) {
  const [model, setModel] = useState('gpt-5.2')
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'generating' | 'complete' | 'error'
  >('idle')
  const [generationFiles, setGenerationFiles] = useState<
    { path: string; status: 'pending' | 'generating' | 'complete' | 'error'; lines?: number }[]
  >([])
  const [buildErrors, setBuildErrors] = useState<BuildError[]>([])
  const [checkpoints, setCheckpoints] = useState<CheckpointEvent[]>([])
  const [layerCommits, setLayerCommits] = useState<LayerCommitEvent[]>([])
  const [_activeAgents, setActiveAgents] = useState<
    { id: string; name: string; status: 'running' | 'complete'; message?: string }[]
  >([])
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

  // Abort in-flight SSE streams on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
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

  // Message persistence is handled by Mastra agent memory (thread/resource)

  const handleGenerationEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case 'stage_update':
          if (event.stage === 'complete') {
            setGenerationStatus('complete')
          } else if (event.stage === 'error') {
            setGenerationStatus('error')
          }
          break
        case 'agent_start':
          setActiveAgents((prev) => [
            ...prev.filter((a) => a.id !== event.agentId),
            { id: event.agentId, name: event.agentName, status: 'running' as const },
          ])
          break
        case 'agent_progress':
          setActiveAgents((prev) =>
            prev.map((a) => (a.id === event.agentId ? { ...a, message: event.message } : a)),
          )
          break
        case 'agent_complete':
          setActiveAgents((prev) =>
            prev.map((a) => (a.id === event.agentId ? { ...a, status: 'complete' as const } : a)),
          )
          break
        case 'agent_artifact':
          break
        case 'plan_ready':
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
          onGenerationComplete?.()
          break
        case 'error':
          setGenerationStatus('error')
          break
        case 'build_error':
          setBuildErrors(event.errors)
          break
        case 'checkpoint':
          setCheckpoints((prev) => {
            const existing = prev.findIndex((c) => c.label === event.label)
            if (existing >= 0) {
              const updated = [...prev]
              updated[existing] = event
              return updated
            }
            return [...prev, event]
          })
          break
        case 'layer_commit':
          setLayerCommits((prev) => [...prev, event])
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
      }
    },
    [onGenerationComplete],
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
   * Replaces the Vercel AI SDK useChat + /api/chat flow.
   */
  const sendChatMessage = useCallback(
    async (text: string) => {
      // Guard against concurrent calls
      if (chatStatus === 'streaming') return

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      }
      setMessages((prev) => [...prev, userMessage])
      setChatStatus('streaming')
      setChatError(null)

      const assistantId = `assistant-${Date.now()}`
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant' as const, content: '' }])

      let fullText = ''
      // Abort any previous in-flight request
      abortControllerRef.current?.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Determine endpoint based on whether an element is selected
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
            setMessages((prev) => prev.filter((m) => m.id !== assistantId))
            setChatStatus('ready')
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
              // Also forward generation-relevant events during chat
              handleGenerationEvent,
            )
          }
        } finally {
          reader.releaseLock()
        }

        // If this was an edit operation, notify parent to clear selection
        if (selectedElement) {
          onEditComplete?.()
        }
      } catch (err) {
        // Silent abort on unmount or cancellation
        if (err instanceof Error && err.name === 'AbortError') return
        setChatError(err instanceof Error ? err : new Error('Chat failed'))
        // Remove empty assistant placeholder on error
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content.length > 0))
      } finally {
        setChatStatus('ready')
      }
    },
    [projectId, model, chatStatus, parseSSEBuffer, handleGenerationEvent, selectedElement, onEditComplete],
  )

  // Auto-submit initial prompt (skip if conversation was restored from DB)
  useEffect(() => {
    if (
      initialPrompt &&
      !hasAutoSubmitted.current &&
      messages.length === 0 &&
      !initialMessages?.length
    ) {
      hasAutoSubmitted.current = true
      sendChatMessage(initialPrompt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const _handleStartGeneration = useCallback(
    async (chatPlan: ChatPlan) => {
      setGenerationStatus('generating')
      setGenerationFiles([])

      abortControllerRef.current?.abort()
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      try {
        const response = await apiFetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: chatPlan.appDescription, projectId, model }),
          signal: abortController.signal,
        })

        if (!response.ok || !response.body) {
          if (response.status === 402) {
            const errorData = await response.json()
            setGenerationStatus('error')
            setChatError(
              new Error(
                `Out of credits (${errorData.credits_remaining ?? 0} remaining). Please upgrade to Pro for more credits.`,
              ),
            )
            return
          }
          throw new Error('Generation failed')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const events = buffer.split('\n\n')
            buffer = events.pop() || ''

            for (const eventText of events) {
              if (!eventText.trim() || !eventText.startsWith('data: ')) continue
              try {
                const event: StreamEvent = JSON.parse(eventText.replace(/^data: /, ''))
                handleGenerationEvent(event)
              } catch {
                // skip malformed events
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setGenerationStatus('error')
      }
    },
    [projectId, model, handleGenerationEvent],
  )

  return (
    <div className="flex h-full flex-col">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
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

              {/* Streaming indicator — shown only while waiting for first token */}
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

              {/* Clarification Questions — interactive multi-choice cards */}
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

              {/* Generation Queue — shown below chat messages */}
              {generationFiles.length > 0 && (
                <div className="px-4 py-2">
                  <Queue>
                    <QueueList>
                      {generationFiles.map((file) => (
                        <QueueItem key={file.path}>
                          <div className="flex items-center gap-2">
                            <QueueItemIndicator completed={file.status === 'complete'} />
                            <QueueItemContent completed={file.status === 'complete'}>
                              {file.path}
                              {file.status === 'generating' && ' ...'}
                              {file.lines !== undefined && ` (${file.lines} lines)`}
                            </QueueItemContent>
                          </div>
                        </QueueItem>
                      ))}
                    </QueueList>
                  </Queue>

                  {/* Build Errors */}
                  {buildErrors.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {buildErrors.map((err) => (
                        <StackTrace
                          key={`${err.file}-${err.message}`}
                          trace={err.raw}
                          defaultOpen={false}
                        >
                          <StackTraceHeader>
                            <StackTraceError>
                              <StackTraceErrorType>Build Error</StackTraceErrorType>
                              <StackTraceErrorMessage>{err.message}</StackTraceErrorMessage>
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

                  {/* Checkpoints */}
                  {checkpoints.map((cp) => (
                    <Checkpoint key={cp.label}>
                      <CheckpointIcon />
                      <CheckpointTrigger>
                        {cp.label}
                        {cp.status === 'complete' && (
                          <CheckCircle2 className="ml-1 inline size-3 text-green-500" />
                        )}
                      </CheckpointTrigger>
                    </Checkpoint>
                  ))}

                  {/* Layer Commits */}
                  {layerCommits.map((lc) => (
                    <Commit key={lc.hash}>
                      <CommitHeader>
                        <CommitInfo>
                          <CommitMessage>{lc.message}</CommitMessage>
                          <CommitHash>{lc.hash}</CommitHash>
                        </CommitInfo>
                      </CommitHeader>
                      <CommitContent>
                        <CommitFiles>
                          {lc.files.map((filePath) => (
                            <CommitFile key={filePath}>
                              <CommitFileInfo>
                                <CommitFileIcon />
                                <CommitFilePath>{filePath}</CommitFilePath>
                              </CommitFileInfo>
                              <CommitFileStatus status="added" />
                            </CommitFile>
                          ))}
                        </CommitFiles>
                      </CommitContent>
                    </Commit>
                  ))}
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
          placeholder="Describe what you want to build..."
          status={chatStatus === 'streaming' ? 'streaming' : 'ready'}
          disabled={generationStatus === 'generating'}
        />
      </div>
    </div>
  )
}
