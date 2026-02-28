'use client'

import { Suspense, useMemo } from 'react'
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
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
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
import { ThemeTokensCard } from '@/components/ai-elements/theme-tokens-card'
import type { ThemeTokens as ThemeTokensCardTokens } from '@/components/ai-elements/theme-tokens-card'
import { ArchitectureCard } from '@/components/ai-elements/architecture-card'
import { PageProgressCard } from '@/components/ai-elements/page-progress-card'
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
// File Tree Helpers
// ============================================================================

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
                                  entry.deploymentUrl
                                    ? onPanelOpen({ type: 'preview', previewUrl: entry.deploymentUrl })
                                    : undefined
                                }
                                onAction={() =>
                                  entry.deploymentUrl
                                    ? onPanelOpen({ type: 'preview', previewUrl: entry.deploymentUrl })
                                    : undefined
                                }
                              />
                            )}
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
