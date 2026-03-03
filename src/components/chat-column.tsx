'use client'

import { Fragment, Suspense, useEffect, useMemo } from 'react'
import { Bot, CheckCircle2, CircleCheck, Loader2, Search } from 'lucide-react'
import {
  useAgentStream,
  AGENT_CARD_CONFIG,
  type ToolStep,
  type ChatMessage,
} from '@/hooks/use-agent-stream'
import { ToolActivity } from '@/components/ai-elements/tool-activity'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { ThinkingCard } from '@/components/ai-elements/thinking-card'
import { ThemeTokensCard } from '@/components/ai-elements/theme-tokens-card'
import type { ThemeTokens as ThemeTokensCardTokens } from '@/components/ai-elements/theme-tokens-card'
import { AgentHeader, type AgentType } from '@/components/ai-elements/agent-header'
import { HitlActions } from '@/components/ai-elements/hitl-actions'
import { PlanBlock } from '@/components/ai-elements/plan-block'
import { ScriptBlock } from '@/components/ai-elements/script-block'
import { ClarificationQuestions } from '@/components/clarification-questions'
import { CreditDisplay } from '@/components/credit-display'
import { PromptBar } from '@/components/prompt-bar'
import { ArtifactCard } from '@/components/ai-elements/artifact-card'
import type { PanelContent } from '@/components/right-panel'
import type {
  ElementContext,
  BuildError,
  PageProgressEntry,
  FileAssemblyEntry,
  ValidationCheckEntry,
  TimelineEntry,
  ClarificationQuestion,
  PlanReadyEvent,
} from '@/lib/types'

// ============================================================================
// Types
// ============================================================================

export interface ChatColumnHandle {
  addSystemMessage: (content: string) => void
}

interface ChatColumnProps {
  projectId: string
  initialPrompt?: string
  onSandboxReady?: (sandboxId: string) => void
  onPanelOpen?: (content: PanelContent) => void
  selectedElement?: ElementContext | null
  onEditComplete?: () => void
  onGenerationComplete?: () => void
  onReady?: (handle: ChatColumnHandle) => void
}

// ============================================================================
// Helper Components
// ============================================================================

function formatTimer(ms?: number): string | undefined {
  if (ms == null) return undefined
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
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

// ============================================================================
// ChatMessages — Per-turn interleaved rendering
// ============================================================================

interface ChatMessagesProps {
  messages: ChatMessage[]
  toolSteps: ToolStep[]
  timelineEvents: TimelineEntry[]
  generationStatus: 'idle' | 'generating' | 'complete' | 'error'
  doneSummary?: string
  chatStatus: 'ready' | 'streaming'
  chatError: Error | null
  selectedElement?: ElementContext | null
  hasFiles: boolean
  generationFiles: Array<{
    path: string
    status: 'pending' | 'generating' | 'complete' | 'error'
    lines?: number
  }>
  buildErrors: BuildError[]
  pageProgress: PageProgressEntry[]
  fileAssembly: FileAssemblyEntry[]
  validationChecks: ValidationCheckEntry[]
  pendingClarification: ClarificationQuestion[] | null
  pendingPlan: PlanReadyEvent['plan'] | null
  showTimeline: boolean
  onPanelOpen?: (content: PanelContent) => void
  handleClarificationSubmit: (answersText: string) => Promise<void>
  handlePlanApprove: () => Promise<void>
  handleRequestChanges: () => void
}

function ChatMessages({
  messages,
  toolSteps,
  timelineEvents,
  generationStatus,
  doneSummary,
  chatStatus,
  chatError,
  selectedElement,
  hasFiles,
  generationFiles,
  buildErrors,
  pageProgress,
  fileAssembly,
  validationChecks,
  pendingClarification,
  pendingPlan,
  showTimeline,
  onPanelOpen,
  handleClarificationSubmit,
  handlePlanApprove,
  handleRequestChanges,
}: ChatMessagesProps) {
  // Group tool steps by turnId
  const { toolStepsByTurn, unassignedSteps } = useMemo(() => {
    const byTurn = new Map<string, ToolStep[]>()
    const unassigned: ToolStep[] = []
    for (const step of toolSteps) {
      if (step.turnId) {
        const arr = byTurn.get(step.turnId) ?? []
        arr.push(step)
        byTurn.set(step.turnId, arr)
      } else {
        unassigned.push(step)
      }
    }
    return { toolStepsByTurn: byTurn, unassignedSteps: unassigned }
  }, [toolSteps])

  const lastAssistantId = messages.findLast((m) => m.role === 'assistant')?.id

  return (
    <>
      {/* Interleaved messages + per-turn tool activity */}
      {messages.map((message) => (
        <Fragment key={message.id}>
          <Message from={message.role}>
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

          {/* Tool activity for this assistant turn */}
          {message.role === 'assistant' && (() => {
            const turnSteps = toolStepsByTurn.get(message.id) ?? []
            if (turnSteps.length === 0) return null
            const isLastAssistant = message.id === lastAssistantId
            return (
              <div className="space-y-3 px-4 py-3">
                <ToolActivity steps={turnSteps} onPanelOpen={onPanelOpen} />
                {isLastAssistant && generationStatus === 'complete' && onPanelOpen && (
                  <>
                    {doneSummary && (
                      <p className="text-sm leading-relaxed text-foreground">{doneSummary}</p>
                    )}
                    <ArtifactCard
                      title="App Preview"
                      meta="Live preview available"
                      variant="code"
                      actionLabel="Open Preview"
                      onClick={() => onPanelOpen({ type: 'preview', previewUrl: '' })}
                      onAction={() => onPanelOpen({ type: 'preview', previewUrl: '' })}
                    />
                  </>
                )}
                {isLastAssistant && generationStatus === 'error' && doneSummary && (
                  <div className="rounded-md bg-red-900/50 p-3 text-sm text-red-300">
                    {doneSummary}
                  </div>
                )}
              </div>
            )
          })()}
        </Fragment>
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

      {/* Analyst plan + HITL approve/reject */}
      {pendingPlan && (
        <div className="space-y-3 px-4 py-3">
          <AgentHeader
            agentType="analyst"
            name="Analyst Agent"
            icon={<Search className="size-4" />}
            working={false}
          >
            <div className="flex flex-col gap-3">
              <PlanBlock
                title={`Project Plan — ${pendingPlan.projectName}`}
                items={pendingPlan.features.map((f) => ({
                  title: f.name,
                  description: f.description,
                }))}
              />
              <HitlActions
                onApprove={handlePlanApprove}
                onRequestChanges={handleRequestChanges}
              />
            </div>
          </AgentHeader>
        </div>
      )}

      {/* Fallback: unassigned tool steps (legacy/no turnId) */}
      {unassignedSteps.length > 0 && (
        <div className="space-y-3 px-4 py-3">
          <ToolActivity steps={unassignedSteps} onPanelOpen={onPanelOpen} />
        </div>
      )}

      {/* Legacy timeline events (agent cards from old pipeline) */}
      {showTimeline && timelineEvents.length > 0 && (
        <div className="space-y-3 px-4 py-3">
          {timelineEvents.filter((entry) => {
            // In single orchestrator mode (tool steps present), skip stale error/complete
            // timeline entries — generationStatus already handles these.
            if (toolSteps.length > 0 && (entry.type === 'error' || entry.type === 'complete')) {
              return false
            }
            return true
          }).map((entry) => {
            switch (entry.type) {
              case 'agent': {
                const isComplete = entry.status === 'complete'
                const agentId = entry.agent.agentId
                const cardKey = `agent-${agentId}-${entry.ts}`
                const config = AGENT_CARD_CONFIG[agentId]

                if (agentId === 'analyst') {
                  const planText = entry.plan
                    ? [
                        entry.plan.projectName && `**${entry.plan.projectName}**`,
                        entry.plan.features
                          ?.map((f) => `- **${f.name}**: ${f.description}`)
                          .join('\n'),
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

                if (agentId === 'backend') {
                  return (
                    <AgentHeader
                      key={cardKey}
                      agentType="backend"
                      name="Backend"
                      icon={<Bot className="size-4" />}
                      working={!isComplete}
                      timer={formatTimer(entry.durationMs)}
                    >
                      {fileAssembly.length > 0 && (
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {fileAssembly.map((f) => (
                            <div key={f.path} className="flex items-center gap-2">
                              <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
                              <span className="font-mono text-xs">{f.path}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </AgentHeader>
                  )
                }

                if (agentId === 'architect') {
                  const hasTokens = !!entry.designTokens
                  const architectLabel = isComplete
                    ? (config?.completeLabel ?? 'Designed app architecture')
                    : (config?.runningLabel ?? 'Designing architecture...')
                  return (
                    <div key={cardKey} className="space-y-3">
                      <AgentHeader
                        agentType="architect"
                        name={architectLabel}
                        icon={<Bot className="size-4" />}
                        working={!isComplete}
                        timer={formatTimer(entry.durationMs)}
                      >
                        {hasTokens && (
                          <ThemeTokensCard
                            tokens={entry.designTokens as unknown as ThemeTokensCardTokens}
                          />
                        )}
                      </AgentHeader>
                      {entry.plan && pendingPlan && (
                        <HitlActions onApprove={() => handlePlanApprove()} />
                      )}
                    </div>
                  )
                }

                if (agentId === 'frontend') {
                  const completedPages = pageProgress.filter(
                    (p) => p.status === 'complete',
                  ).length
                  const frontendLabel = isComplete
                    ? `Generated ${completedPages} page${completedPages !== 1 ? 's' : ''}`
                    : (config?.runningLabel ?? 'Generating pages...')
                  return (
                    <AgentHeader
                      key={cardKey}
                      agentType="frontend"
                      name={frontendLabel}
                      icon={<Bot className="size-4" />}
                      working={!isComplete}
                      timer={formatTimer(entry.durationMs)}
                    >
                      {pageProgress.length > 0 && (
                        <div className="space-y-1.5 text-sm">
                          {pageProgress.map((p) => (
                            <div key={p.componentName} className="flex items-center gap-2">
                              {p.status === 'complete' ? (
                                <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
                              ) : (
                                <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-400" />
                              )}
                              <span className="text-muted-foreground">
                                {p.componentName}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </AgentHeader>
                  )
                }

                if (agentId === 'qa') {
                  const failed = validationChecks.filter(
                    (c) => c.status === 'failed',
                  ).length
                  const qaLabel = isComplete
                    ? failed > 0
                      ? 'Validation failed'
                      : 'Validation passed'
                    : (config?.runningLabel ?? 'Validating...')
                  return (
                    <AgentHeader
                      key={cardKey}
                      agentType={'analyst' as AgentType}
                      name={qaLabel}
                      icon={<Bot className="size-4" />}
                      working={!isComplete}
                      timer={formatTimer(entry.durationMs)}
                    >
                      {validationChecks.length > 0 && (
                        <div className="space-y-1.5 text-sm">
                          {validationChecks.map((check) => (
                            <div key={check.name} className="flex items-center gap-2">
                              {check.status === 'passed' ? (
                                <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
                              ) : check.status === 'failed' ? (
                                <span className="size-3.5 shrink-0 text-center text-red-500">
                                  ✕
                                </span>
                              ) : (
                                <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-400" />
                              )}
                              <span className="text-muted-foreground">{check.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </AgentHeader>
                  )
                }

                if (agentId === 'codegen' && hasFiles) {
                  return (
                    <AgentHeader
                      key={cardKey}
                      agentType="frontend"
                      name={isComplete ? 'Generated files' : 'Generating files...'}
                      icon={<Bot className="size-4" />}
                      working={!isComplete}
                      timer={formatTimer(entry.durationMs)}
                    >
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {generationFiles.map((f) => (
                          <div key={f.path} className="flex items-center gap-2">
                            {f.status === 'complete' ? (
                              <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
                            ) : f.status === 'generating' ? (
                              <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-400" />
                            ) : (
                              <span className="size-3.5 shrink-0" />
                            )}
                            <span className="font-mono text-xs">{f.path}</span>
                          </div>
                        ))}
                      </div>
                    </AgentHeader>
                  )
                }

                {
                  const genericLabel = isComplete
                    ? (config?.completeLabel ?? entry.agent.agentName)
                    : (config?.runningLabel ?? `${entry.agent.agentName}...`)
                  return (
                    <AgentHeader
                      key={cardKey}
                      agentType="infra"
                      name={genericLabel}
                      icon={<Bot className="size-4" />}
                      working={!isComplete}
                      timer={formatTimer(entry.durationMs)}
                    >
                      {entry.progressMessages && entry.progressMessages.length > 0 && (
                        <div className="space-y-1.5 text-sm text-muted-foreground">
                          {entry.progressMessages.map((msg) => (
                            <div key={msg} className="flex items-center gap-2">
                              <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
                              <span>{msg}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </AgentHeader>
                  )
                }
              }

              case 'error':
                return (
                  <ScriptBlock
                    key={`error-${entry.ts}`}
                    command="Pipeline Error"
                    commandLabel="Error"
                    output={entry.error}
                    outputLabel="Details"
                  />
                )

              case 'complete':
                return null

              default:
                return null
            }
          })}
        </div>
      )}

      {/* Build Errors */}
      {buildErrors.length > 0 && (
        <div className="space-y-2 px-4 py-3">
          {buildErrors.map((err) => (
            <ScriptBlock
              key={`${err.file}-${err.message}`}
              command={`Build Error: ${err.file}`}
              commandLabel="Error"
              output={err.raw}
              outputLabel="Details"
            />
          ))}
        </div>
      )}
    </>
  )
}

// ============================================================================
// ChatColumn
// ============================================================================

export function ChatColumn({
  projectId,
  initialPrompt,
  onSandboxReady,
  onPanelOpen,
  selectedElement,
  onEditComplete,
  onGenerationComplete,
  onReady,
}: ChatColumnProps) {
  const {
    model: _model,
    generationStatus,
    doneSummary,
    generationFiles,
    buildErrors,
    pageProgress,
    fileAssembly,
    validationChecks,
    timelineEvents,
    toolSteps,
    pendingClarification,
    pendingPlan,
    userCredits,
    messages,
    chatStatus,
    chatError,
    hasFiles,
    showTimeline,
    addSystemMessage,
    handleStop,
    handleClarificationSubmit,
    handlePlanApprove,
    handleRequestChanges,
    handleSubmit,
  } = useAgentStream({
    projectId,
    initialPrompt,
    onGenerationComplete,
    onSandboxReady,
    selectedElement,
    onEditComplete,
  })

  // Expose addSystemMessage to parent via onReady callback
  useEffect(() => {
    onReady?.({ addSystemMessage })
  }, [onReady, addSystemMessage])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 && !showTimeline ? (
            <div className="flex h-full flex-col items-center justify-center" />
          ) : (
            <ChatMessages
              messages={messages}
              toolSteps={toolSteps}
              timelineEvents={timelineEvents}
              generationStatus={generationStatus}
              doneSummary={doneSummary}
              chatStatus={chatStatus}
              chatError={chatError}
              selectedElement={selectedElement}
              hasFiles={hasFiles}
              generationFiles={generationFiles}
              buildErrors={buildErrors}
              pageProgress={pageProgress}
              fileAssembly={fileAssembly}
              validationChecks={validationChecks}
              pendingClarification={pendingClarification}
              pendingPlan={pendingPlan}
              showTimeline={showTimeline}
              onPanelOpen={onPanelOpen}
              handleClarificationSubmit={handleClarificationSubmit}
              handlePlanApprove={handlePlanApprove}
              handleRequestChanges={handleRequestChanges}
            />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="flex justify-center px-6 pb-6">
        <div className="w-full max-w-[768px]">
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
    </div>
  )
}
