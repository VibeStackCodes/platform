'use client'

import { Suspense } from 'react'
import {
  Bot,
  CheckCircle2,
  CircleCheck,
  Loader2,
  Rocket,
} from 'lucide-react'
import {
  useAgentStream,
  AGENT_CARD_CONFIG,
} from '@/hooks/use-agent-stream'
import { ToolActivity } from '@/components/ai-elements/tool-activity'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { ThinkingCard } from '@/components/ai-elements/thinking-card'
import { ThemeTokensCard } from '@/components/ai-elements/theme-tokens-card'
import type { ThemeTokens as ThemeTokensCardTokens } from '@/components/ai-elements/theme-tokens-card'
import { AgentHeader, type AgentType } from '@/components/ai-elements/agent-header'
import { HitlActions } from '@/components/ai-elements/hitl-actions'
import { ScriptBlock } from '@/components/ai-elements/script-block'
import { ClarificationQuestions } from '@/components/clarification-questions'
import { CreditDisplay } from '@/components/credit-display'
import { PromptBar } from '@/components/prompt-bar'
import { ArtifactCard } from '@/components/artifact-card'
import type { PanelContent } from '@/components/right-panel'
import type { ElementContext } from '@/lib/types'

// ============================================================================
// Types
// ============================================================================

interface ChatColumnProps {
  projectId: string
  initialPrompt?: string
  onSandboxReady?: (sandboxId: string) => void
  onPanelOpen?: (content: PanelContent) => void
  selectedElement?: ElementContext | null
  onEditComplete?: () => void
  onGenerationComplete?: () => void
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
}: ChatColumnProps) {
  const {
    model: _model,
    generationStatus: _generationStatus,
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
    handleStop,
    handleClarificationSubmit,
    handlePlanApprove,
    handleSubmit,
  } = useAgentStream({
    projectId,
    initialPrompt,
    onGenerationComplete,
    onSandboxReady,
    selectedElement,
    onEditComplete,
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 && !showTimeline ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <ConversationEmptyState
                icon={<Bot className="size-12" />}
                title="Start building"
                description="Describe what you want to build and I'll help you refine the idea before generating code"
              />
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

                        // Backend → AgentHeader
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

                        // Architect → AgentHeader with theme tokens + plan approval
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
                                <HitlActions
                                  onApprove={() => handlePlanApprove()}
                                />
                              )}
                            </div>
                          )
                        }

                        // Frontend → AgentHeader with page progress
                        if (agentId === 'frontend') {
                          const completedPages = pageProgress.filter((p) => p.status === 'complete').length
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
                                      <span className="text-muted-foreground">{p.componentName}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </AgentHeader>
                          )
                        }

                        // QA → AgentHeader with validation checks
                        if (agentId === 'qa') {
                          const failed = validationChecks.filter((c) => c.status === 'failed').length
                          const qaLabel = isComplete
                            ? (failed > 0 ? 'Validation failed' : 'Validation passed')
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
                                        <span className="size-3.5 shrink-0 text-center text-red-500">✕</span>
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

                        // Legacy Pipeline A (codegen)
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

                        // Generic agents (provisioner, repair, reviewer, etc.)
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
                        return (
                          <div
                            key={`complete-${entry.ts}`}
                            className="space-y-3"
                          >
                            <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
                              <Rocket className="size-4" />
                              <span>Your app is ready!</span>
                            </div>
                            {onPanelOpen && (
                              <ArtifactCard
                                icon={<Rocket className="size-6" />}
                                title="App Preview"
                                meta={entry.deploymentUrl ?? 'Live preview available'}
                                actionLabel="Open Preview"
                                onClick={() =>
                                  onPanelOpen({ type: 'preview', previewUrl: entry.deploymentUrl ?? '' })
                                }
                                onAction={() =>
                                  onPanelOpen({ type: 'preview', previewUrl: entry.deploymentUrl ?? '' })
                                }
                              />
                            )}
                          </div>
                        )

                      default:
                        return null
                    }
                  })}

                  {/* Tool Activity (single orchestrator tool steps) */}
                  {toolSteps.length > 0 && (
                    <ToolActivity
                      steps={toolSteps}
                      onPanelOpen={onPanelOpen}
                    />
                  )}

                  {/* Build Errors (outside timeline entries) */}
                  {buildErrors.length > 0 && (
                    <div className="space-y-2">
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
                </div>
              )}
            </>
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
