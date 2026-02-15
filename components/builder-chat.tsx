"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolHeader,
} from "@/components/ai-elements/tool";
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanContent,
  PlanTrigger,
  PlanAction,
} from "@/components/ai-elements/plan";
import {
  Queue,
  QueueItem,
  QueueItemIndicator,
  QueueItemContent,
  QueueList,
} from "@/components/ai-elements/queue";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from "@/components/ai-elements/confirmation";
import {
  StackTrace,
  StackTraceHeader,
  StackTraceError,
  StackTraceErrorType,
  StackTraceErrorMessage,
  StackTraceActions,
  StackTraceCopyButton,
  StackTraceExpandButton,
  StackTraceContent,
  StackTraceFrames,
} from "@/components/ai-elements/stack-trace";
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from "@/components/ai-elements/checkpoint";
import {
  Commit,
  CommitHeader,
  CommitHash,
  CommitMessage,
  CommitInfo,
  CommitContent,
  CommitFiles,
  CommitFile,
  CommitFileInfo,
  CommitFileIcon,
  CommitFilePath,
  CommitFileStatus,
} from "@/components/ai-elements/commit";
import { PromptBar } from "@/components/prompt-bar";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Bot, Rocket, CheckCircle2, Pencil, Search, FileCode2, CircleAlert } from "lucide-react";
import type { StreamEvent, ChatPlan, BuildError, CheckpointEvent, LayerCommitEvent, FeatureSpec } from "@/lib/types";

interface BuilderChatProps {
  projectId: string;
  initialPrompt?: string;
  initialMessages?: Array<{ id: string; role: "user" | "assistant" | "system"; parts: Array<Record<string, unknown>> }>;
  onGenerationComplete?: () => void;
}

const SUGGESTIONS = [
  "A todo app with authentication",
  "A blog with markdown editor",
  "An e-commerce store with Stripe",
  "A real-time chat application",
];

export function BuilderChat({ projectId, initialPrompt, initialMessages, onGenerationComplete }: BuilderChatProps) {
  const [model, setModel] = useState("gpt-5.2");
  const [generationStatus, setGenerationStatus] = useState<
    "idle" | "generating" | "complete" | "error"
  >("idle");
  const [generationFiles, setGenerationFiles] = useState<
    { path: string; status: "pending" | "generating" | "complete" | "error"; lines?: number }[]
  >([]);
  const [buildErrors, setBuildErrors] = useState<BuildError[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointEvent[]>([]);
  const [layerCommits, setLayerCommits] = useState<LayerCommitEvent[]>([]);
  const [activeAgents, setActiveAgents] = useState<
    { id: string; name: string; status: 'running' | 'complete'; message?: string }[]
  >([]);
  const hasAutoSubmitted = useRef(false);

  const { messages, status, error: chatError, sendMessage, addToolResult } = useChat({
    messages: initialMessages as UIMessage[] | undefined,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { projectId, model },
    }),
    onError: (err) => {
      console.error("[BuilderChat] useChat error:", err);
    },
  });

  // Message persistence is handled by Mastra agent memory (thread/resource)

  // Auto-submit initial prompt (skip if conversation was restored from DB)
  useEffect(() => {
    if (initialPrompt && !hasAutoSubmitted.current && messages.length === 0 && !initialMessages?.length) {
      hasAutoSubmitted.current = true;
      sendMessage({ text: initialPrompt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-complete thinking_steps tool calls so the AI can proceed to show_plan
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts ?? []) {
        if (
          part.type === "tool-thinking_steps" &&
          part.state === "input-available"
        ) {
          addToolResult({
            tool: "thinking_steps",
            toolCallId: part.toolCallId,
            output: "acknowledged",
          });
        }
      }
    }
  }, [messages, addToolResult]);

  const handleSubmit = async (
    message: PromptInputMessage,
    options: { model: string; webSearch: boolean }
  ) => {
    if (!message.text?.trim()) return;
    setModel(options.model);
    sendMessage({ text: message.text });
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage({ text: suggestion });
  };

  const handleApprove = useCallback(
    (toolCallId: string) => {
      addToolResult({
        tool: "show_plan",
        toolCallId,
        output: "approved",
      });
    },
    [addToolResult]
  );

  const handleReject = useCallback(
    (toolCallId: string) => {
      const reason = window.prompt("What changes would you like?");
      if (reason) {
        addToolResult({
          tool: "show_plan",
          toolCallId,
          output: `rejected: ${reason}`,
        });
      }
    },
    [addToolResult]
  );

  const handleStartGeneration = useCallback(async (chatPlan: ChatPlan) => {
    setGenerationStatus("generating");
    // Agent pipeline sends events as SSE — start with empty state
    setGenerationFiles([]);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chatPlan.appDescription, projectId }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Generation failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventText of events) {
          if (!eventText.trim() || !eventText.startsWith("data: ")) continue;
          try {
            const event: StreamEvent = JSON.parse(eventText.replace(/^data: /, ""));
            handleGenerationEvent(event);
          } catch {
            // skip malformed events
          }
        }
      }
    } catch {
      setGenerationStatus("error");
    }
  }, [projectId, model]);

  const handleGenerationEvent = (event: StreamEvent) => {
    switch (event.type) {
      case "stage_update":
        if (event.stage === "complete") {
          setGenerationStatus("complete");
        } else if (event.stage === "error") {
          setGenerationStatus("error");
        }
        break;
      case "agent_start":
        setActiveAgents((prev) => [
          ...prev.filter((a) => a.id !== event.agentId),
          { id: event.agentId, name: event.agentName, status: "running" as const },
        ]);
        break;
      case "agent_progress":
        setActiveAgents((prev) =>
          prev.map((a) =>
            a.id === event.agentId ? { ...a, message: event.message } : a
          )
        );
        break;
      case "agent_complete":
        setActiveAgents((prev) =>
          prev.map((a) =>
            a.id === event.agentId ? { ...a, status: "complete" as const } : a
          )
        );
        break;
      case "agent_artifact":
        // Track artifacts per agent if needed in the future
        break;
      case "plan_ready":
        // Agent-generated plan received — could show approval UI
        break;
      case "file_start":
        setGenerationFiles((prev) => {
          const exists = prev.some((f) => f.path === event.path);
          if (exists) {
            return prev.map((f) => (f.path === event.path ? { ...f, status: "generating" as const } : f));
          }
          return [...prev, { path: event.path, status: "generating" as const }];
        });
        break;
      case "file_complete":
        setGenerationFiles((prev) =>
          prev.map((f) =>
            f.path === event.path
              ? { ...f, status: "complete" as const, lines: event.linesOfCode }
              : f
          )
        );
        break;
      case "file_error":
        setGenerationFiles((prev) =>
          prev.map((f) => (f.path === event.path ? { ...f, status: "error" as const } : f))
        );
        break;
      case "complete":
        setGenerationStatus("complete");
        onGenerationComplete?.();
        break;
      case "error":
        setGenerationStatus("error");
        break;
      case "build_error":
        setBuildErrors(event.errors);
        break;
      case "checkpoint":
        setCheckpoints((prev) => {
          // Update existing checkpoint with same label, or add new
          const existing = prev.findIndex((c) => c.label === event.label);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = event;
            return updated;
          }
          return [...prev, event];
        });
        break;
      case "layer_commit":
        setLayerCommits((prev) => [...prev, event]);
        break;
    }
  };

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
                    {message.parts.map((part, i) => {
                      const key = `${message.id}-${i}`;

                      switch (part.type) {
                        case "text":
                          return <MessageResponse key={key}>{part.text}</MessageResponse>;

                        case "reasoning":
                          return (
                            <Reasoning key={key} isStreaming={part.state === "streaming"}>
                              <ReasoningTrigger />
                              <ReasoningContent>{part.text}</ReasoningContent>
                            </Reasoning>
                          );

                        // Tool: thinking_steps
                        case "tool-thinking_steps": {
                          if (part.state === "input-streaming") {
                            return (
                              <Tool key={key}>
                                <ToolHeader title="Planning" type={part.type} state={part.state} />
                              </Tool>
                            );
                          }
                          const stepsInput = part.input as { steps?: Array<{ label: string; description?: string }> };
                          if (!stepsInput?.steps) return null;
                          return (
                            <ChainOfThought key={key} defaultOpen>
                              <ChainOfThoughtHeader>Planning steps</ChainOfThoughtHeader>
                              <ChainOfThoughtContent>
                                {stepsInput.steps.map((step, idx) => (
                                  <ChainOfThoughtStep
                                    key={step.label}
                                    label={step.label}
                                    description={step.description}
                                    status={idx < stepsInput.steps!.length - 1 ? "complete" : "active"}
                                  />
                                ))}
                              </ChainOfThoughtContent>
                            </ChainOfThought>
                          );
                        }

                        // Tool: ask_clarifying_question
                        case "tool-ask_clarifying_question": {
                          const isStreaming = part.state === "input-streaming";
                          if (isStreaming) {
                            return (
                              <Tool key={key}>
                                <ToolHeader
                                  title="Clarifying question"
                                  type={part.type}
                                  state={part.state}
                                />
                              </Tool>
                            );
                          }
                          const qInput = part.input as { question?: string; options?: string[] };
                          if (!qInput?.question) return null;
                          return (
                            <div key={key} className="space-y-3">
                              <MessageResponse>{qInput.question}</MessageResponse>
                              {qInput.options && qInput.options.length > 0 && (
                                <Suggestions vertical>
                                  {qInput.options.map((opt: string) => (
                                    <Suggestion
                                      key={opt}
                                      suggestion={opt}
                                      onClick={handleSuggestionClick}
                                    />
                                  ))}
                                </Suggestions>
                              )}
                            </div>
                          );
                        }

                        // Tool: show_plan
                        case "tool-show_plan": {
                          if (part.state === "input-streaming") {
                            return (
                              <Tool key={key}>
                                <ToolHeader
                                  title="Building plan"
                                  type={part.type}
                                  state={part.state}
                                />
                              </Tool>
                            );
                          }
                          const chatPlan = part.input as ChatPlan;
                          if (!chatPlan?.appName) return null;
                          const features = Array.isArray(chatPlan.features) ? chatPlan.features : [];
                          const designTokens = chatPlan.designTokens || {} as ChatPlan["designTokens"];
                          const isComplete = features.length > 0;
                          return (
                            <Plan key={key} isStreaming={!isComplete} defaultOpen>
                              <PlanHeader>
                                <div>
                                  <PlanTitle>{chatPlan.appName}</PlanTitle>
                                  <PlanDescription>{chatPlan.appDescription || ""}</PlanDescription>
                                </div>
                                <PlanAction>
                                  <PlanTrigger />
                                </PlanAction>
                              </PlanHeader>
                              <PlanContent>
                                <div className="space-y-3">
                                  {features.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium mb-1">
                                      Features ({features.length})
                                    </h4>
                                    <ul className="text-sm text-muted-foreground space-y-1">
                                      {features.map((f: FeatureSpec, idx: number) => (
                                        <li key={idx} className="flex items-start gap-2">
                                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                                            {f.category}
                                          </span>
                                          <span>{f.description}</span>
                                          {f.entity && (
                                            <span className="text-xs text-muted-foreground">
                                              ({f.entity.name}: {f.entity.fields.map(fd => fd.name).join(", ")})
                                            </span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  )}
                                  {Array.isArray(chatPlan.shadcnComponents) && chatPlan.shadcnComponents.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium mb-1">
                                      Components ({chatPlan.shadcnComponents.length + 4})
                                    </h4>
                                    <div className="flex flex-wrap gap-1">
                                      {['button', 'card', 'input', 'label', ...chatPlan.shadcnComponents].map((c: string) => (
                                        <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                                          {c}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  )}
                                  {designTokens.primaryColor && (
                                  <div>
                                    <h4 className="text-sm font-medium mb-1">Design</h4>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                      <span
                                        className="inline-block size-3 rounded-full border"
                                        style={{ backgroundColor: designTokens.primaryColor }}
                                      />
                                      <span>{designTokens.primaryColor}</span>
                                      <span
                                        className="inline-block size-3 rounded-full border"
                                        style={{ backgroundColor: designTokens.accentColor }}
                                      />
                                      <span>{designTokens.accentColor}</span>
                                      <span className="ml-1">{designTokens.fontFamily}</span>
                                    </div>
                                  </div>
                                  )}
                                  <Confirmation
                                    approval={
                                      generationStatus !== "idle"
                                        ? { id: part.toolCallId, approved: true }
                                        : { id: part.toolCallId }
                                    }
                                    state={
                                      generationStatus !== "idle"
                                        ? "approval-responded"
                                        : "approval-requested"
                                    }
                                  >
                                    <ConfirmationTitle>
                                      Ready to generate {chatPlan.appName}?
                                    </ConfirmationTitle>
                                    <ConfirmationRequest>
                                      <ConfirmationActions>
                                        <ConfirmationAction
                                          variant="outline"
                                          onClick={() => handleReject(part.toolCallId)}
                                        >
                                          Request Changes
                                        </ConfirmationAction>
                                        <ConfirmationAction
                                          onClick={() => {
                                            handleApprove(part.toolCallId);
                                            handleStartGeneration(chatPlan);
                                          }}
                                          disabled={!isComplete}
                                        >
                                          <Rocket className="mr-2 size-4" />
                                          Approve & Generate
                                        </ConfirmationAction>
                                      </ConfirmationActions>
                                    </ConfirmationRequest>
                                    <ConfirmationAccepted>
                                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                                        <CheckCircle2 className="size-4" />
                                        Plan approved — generating code...
                                      </div>
                                    </ConfirmationAccepted>
                                    <ConfirmationRejected>
                                      <div className="text-sm text-muted-foreground">
                                        Changes requested — revising plan...
                                      </div>
                                    </ConfirmationRejected>
                                  </Confirmation>
                                </div>
                              </PlanContent>
                            </Plan>
                          );
                        }

                        // Tool: start_generation
                        case "tool-start_generation":
                          return null;

                        // Tool: edit_code
                        case "tool-edit_code": {
                          if (part.state === "input-streaming") {
                            return (
                              <Tool key={key}>
                                <ToolHeader
                                  title="Editing code"
                                  type={part.type}
                                  state={part.state}
                                />
                              </Tool>
                            );
                          }
                          const editInput = part.input as {
                            instruction?: string;
                            searchQueries?: string[];
                            reasoning?: string;
                          };
                          const editOutput = part.output as { filesModified?: string[]; buildPassed?: boolean; status?: string; message?: string } | undefined;
                          const isEditComplete = part.state === "output-available";

                          return (
                            <ChainOfThought key={key} defaultOpen>
                              <ChainOfThoughtHeader>
                                <Pencil className="mr-1.5 inline size-3.5" />
                                Editing code
                              </ChainOfThoughtHeader>
                              <ChainOfThoughtContent>
                                {editInput?.reasoning && (
                                  <ChainOfThoughtStep
                                    label="Analysis"
                                    description={editInput.reasoning}
                                    status="complete"
                                  />
                                )}
                                {editInput?.searchQueries && (
                                  <ChainOfThoughtStep
                                    label="Searching"
                                    description={editInput.searchQueries.map(q => `"${q}"`).join(', ')}
                                    status={isEditComplete ? "complete" : "active"}
                                  />
                                )}
                                {isEditComplete && editOutput && 'filesModified' in editOutput && (
                                  <>
                                    <ChainOfThoughtStep
                                      label={`Modified ${editOutput.filesModified!.length} file(s)`}
                                      description={editOutput.filesModified!.join(', ')}
                                      status="complete"
                                    />
                                    <div className="mt-2 flex items-center gap-2 text-sm">
                                      {editOutput.buildPassed ? (
                                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                          <CheckCircle2 className="size-3.5" />
                                          Build passed
                                        </span>
                                      ) : (
                                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                          <CircleAlert className="size-3.5" />
                                          Build has issues
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}
                                {isEditComplete && editOutput && 'status' in editOutput && editOutput.status === 'error' && (
                                  <div className="mt-2 text-sm text-red-500">
                                    {editOutput.message}
                                  </div>
                                )}
                              </ChainOfThoughtContent>
                            </ChainOfThought>
                          );
                        }

                        default:
                          return null;
                      }
                    })}
                  </MessageContent>
                </Message>
              ))}

              {/* Chat error */}
              {chatError && (
                <div className="mx-4 my-2 rounded-md bg-red-900/50 p-3 text-sm text-red-300" data-testid="chat-error">
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
                            <QueueItemIndicator completed={file.status === "complete"} />
                            <QueueItemContent completed={file.status === "complete"}>
                              {file.path}
                              {file.status === "generating" && " ..."}
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
                      {buildErrors.map((err, i) => (
                        <StackTrace key={`${err.file}-${i}`} trace={err.raw} defaultOpen={i === 0}>
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
                        {cp.status === "complete" && (
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
                          <CommitMessage>
                            {lc.message}
                          </CommitMessage>
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
        <PromptBar
          onSubmit={handleSubmit}
          placeholder="Describe what you want to build..."
          status={status === "streaming" ? "streaming" : "ready"}
          disabled={generationStatus === "generating"}
        />
      </div>
    </div>
  );
}
