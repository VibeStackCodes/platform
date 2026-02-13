# AI Elements UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire 5 unused Vercel AI Elements (ChainOfThought, Confirmation, StackTrace, Checkpoint, Commit) into the builder chat to improve plan approval and generation feedback UX.

**Architecture:** Add new StreamEvent types for checkpoint/commit, add a `thinking_steps` chat tool, then rewire `builder-chat.tsx` to render these elements inline with existing message parts.

**Tech Stack:** AI SDK (`useChat`, `addToolResult`), Vercel AI Elements, Zod, TypeScript

---

### Task 1: Add new StreamEvent types

**Files:**
- Modify: `platform/lib/types.ts:230-242`

**Step 1: Add `CheckpointEvent` and `LayerCommitEvent` interfaces and extend the union**

Add after `ErrorEvent` (line 310):

```typescript
export interface CheckpointEvent {
  type: 'checkpoint';
  label: string;
  status: 'active' | 'complete';
}

export interface LayerCommitEvent {
  type: 'layer_commit';
  layer: number;
  hash: string;
  message: string;
  files: string[];
}
```

Update the `StreamEvent` union (line 230) to include:

```typescript
export type StreamEvent =
  | StageUpdateEvent
  | FileStartEvent
  | FileChunkEvent
  | FileCompleteEvent
  | FileErrorEvent
  | BuildErrorEvent
  | BuildFixEvent
  | RequirementResultEvent
  | PreviewReadyEvent
  | CodeServerReadyEvent
  | CompleteEvent
  | ErrorEvent
  | CheckpointEvent
  | LayerCommitEvent;
```

**Step 2: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

**Step 3: Commit**

```bash
git add platform/lib/types.ts
git commit -m "feat: add checkpoint and layer_commit stream events"
```

---

### Task 2: Emit checkpoint and layer_commit events from generator

**Files:**
- Modify: `platform/lib/generator.ts:80-131`

**Step 1: Emit checkpoint at layer start**

In `generateFiles()`, after the `console.log` for each layer (line 82), add:

```typescript
emit({
  type: 'checkpoint',
  label: `Layer ${layer}: ${LAYER_LABELS[layer] || 'files'}`,
  status: 'active',
});
```

**Step 2: Emit layer_commit after git commit**

Replace the git commit block (lines 118-131) to capture the hash and emit:

```typescript
// Git commit this layer's files
const label = LAYER_LABELS[layer] || `layer ${layer} files`;
const filePaths = layerFiles.map(f => f.path).join(' ');
try {
  const commitResult = await runCommand(
    sandbox,
    `cd /workspace && git add ${filePaths} && git commit -m "feat: add ${label}" && git rev-parse --short HEAD`,
    `git-layer-${layer}`,
    { cwd: '/workspace', timeout: 30 }
  );
  const hash = commitResult.stdout.trim().split('\n').pop() || 'unknown';
  console.log(`✓ Committed layer ${layer}: ${label} (${hash})`);

  emit({
    type: 'layer_commit',
    layer,
    hash,
    message: `feat: add ${label}`,
    files: layerFiles.map(f => f.path),
  });
} catch (error) {
  console.warn(`Git commit for layer ${layer} failed (non-fatal):`, error);
}

emit({
  type: 'checkpoint',
  label: `Layer ${layer}: ${LAYER_LABELS[layer] || 'files'}`,
  status: 'complete',
});
```

**Step 3: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

**Step 4: Commit**

```bash
git add platform/lib/generator.ts
git commit -m "feat: emit checkpoint and layer_commit events during generation"
```

---

### Task 3: Emit checkpoint events from verifier

**Files:**
- Modify: `platform/lib/verifier.ts`

**Step 1: Add checkpoint emissions at verification boundaries**

At the start of `verifyAndFix()`, emit:

```typescript
emit({
  type: 'checkpoint',
  label: 'Build verification',
  status: 'active',
});
```

When build passes (before returning `true`), emit:

```typescript
emit({
  type: 'checkpoint',
  label: 'Build verification',
  status: 'complete',
});
```

When all fix attempts exhausted (before returning `false`), emit:

```typescript
emit({
  type: 'checkpoint',
  label: 'Build verification failed',
  status: 'complete',
});
```

**Step 2: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

**Step 3: Commit**

```bash
git add platform/lib/verifier.ts
git commit -m "feat: emit checkpoint events from verifier"
```

---

### Task 4: Add `thinking_steps` chat tool

**Files:**
- Modify: `platform/lib/chat-tools.ts`

**Step 1: Add the tool definition**

Add after the `start_generation` tool:

```typescript
thinking_steps: tool({
  description:
    'Show the user what you are thinking about while planning. Call this BEFORE show_plan to make your reasoning visible. Each step represents a phase of your analysis.',
  inputSchema: z.object({
    steps: z.array(
      z.object({
        label: z.string().describe('Short step name, e.g. "Analyzing requirements"'),
        description: z.string().optional().describe('Brief detail about this step'),
      })
    ).describe('3-5 planning steps showing your thought process'),
  }),
  execute: async ({ steps }) => {
    return { steps };
  },
}),
```

**Step 2: Update system prompt to instruct model to call this tool**

Modify `platform/lib/system-prompt.ts` — in `BUILDER_SYSTEM_PROMPT`, add to the instructions section:

```
Before calling show_plan, ALWAYS call thinking_steps first to show the user your planning process. Include 3-5 steps like "Analyzing requirements", "Designing database schema", "Planning file architecture", "Selecting dependencies".
```

**Step 3: Update mock chat route**

In `platform/app/api/chat/route.ts`, update `buildMockChatResponse` to emit `thinking_steps` before `show_plan` on turn 2:

For `turnNumber === 2`, change to emit thinking_steps first. Since mock mode uses a single tool call per turn, add a new turn:

```typescript
if (turnNumber === 2) {
  streamResult = toolCallStreamResult('mock-think', 'thinking_steps', {
    steps: [
      { label: 'Analyzing requirements', description: 'Identifying core features and constraints' },
      { label: 'Designing database schema', description: 'Planning tables, RLS policies, and relations' },
      { label: 'Planning file architecture', description: 'Organizing files by dependency layers' },
      { label: 'Selecting dependencies', description: 'Choosing npm packages and versions' },
    ],
  });
} else if (turnNumber === 3) {
  streamResult = toolCallStreamResult('mock-plan', 'show_plan', MOCK_PLAN);
} else if (turnNumber >= 4) {
  streamResult = toolCallStreamResult('mock-gen', 'start_generation', { approved: true });
}
```

**Step 4: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

**Step 5: Commit**

```bash
git add platform/lib/chat-tools.ts platform/lib/system-prompt.ts platform/app/api/chat/route.ts
git commit -m "feat: add thinking_steps chat tool for ChainOfThought UX"
```

---

### Task 5: Render ChainOfThought in builder-chat

**Files:**
- Modify: `platform/components/builder-chat.tsx`

**Step 1: Add imports**

```typescript
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
```

**Step 2: Add tool-thinking_steps case**

In the `switch (part.type)` inside message rendering, add before `case "tool-show_plan"`:

```typescript
// Tool: thinking_steps
case "tool-thinking_steps": {
  if (part.state === "input-streaming") {
    return (
      <Tool key={key}>
        <ToolHeader
          title="Planning..."
          type={part.type}
          state={part.state}
        />
      </Tool>
    );
  }
  const input = part.input as {
    steps?: { label: string; description?: string }[];
  };
  if (!input?.steps) return null;
  return (
    <ChainOfThought key={key} defaultOpen>
      <ChainOfThoughtHeader>Planning</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {input.steps.map((step, idx) => (
          <ChainOfThoughtStep
            key={step.label}
            label={step.label}
            description={step.description}
            status={idx < input.steps!.length - 1 ? "complete" : "active"}
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
```

**Step 3: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

**Step 4: Commit**

```bash
git add platform/components/builder-chat.tsx
git commit -m "feat: render ChainOfThought for thinking_steps tool"
```

---

### Task 6: Replace plan approval Button with Confirmation element

**Files:**
- Modify: `platform/components/builder-chat.tsx`

**Step 1: Add imports**

```typescript
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from "@/components/ai-elements/confirmation";
```

**Step 2: Replace the Button in show_plan case**

Replace the current `<Button>` block (the one with "Approve & Generate" text, around lines 360-376) with:

```typescript
<Confirmation
  approval={
    part.output
      ? { id: part.toolCallId, approved: part.output === "approved" }
      : { id: part.toolCallId }
  }
  state={part.state}
>
  <ConfirmationTitle>
    Ready to generate {plan.appName}?
  </ConfirmationTitle>
  <ConfirmationRequest>
    <ConfirmationActions>
      <ConfirmationAction
        variant="outline"
        onClick={() => {
          addToolResult({
            tool: "show_plan",
            toolCallId: part.toolCallId,
            output: "rejected",
          });
        }}
      >
        Request Changes
      </ConfirmationAction>
      <ConfirmationAction
        onClick={() => {
          handleApprove(part.toolCallId);
          handleStartGeneration(plan);
        }}
        disabled={generationStatus !== "idle" || !isComplete}
      >
        Approve & Generate
      </ConfirmationAction>
    </ConfirmationActions>
  </ConfirmationRequest>
  <ConfirmationAccepted>
    Plan approved — generating code...
  </ConfirmationAccepted>
  <ConfirmationRejected>
    Changes requested — describe what you'd like different.
  </ConfirmationRejected>
</Confirmation>
```

Also remove the old `<Button>` import of `Rocket` if no longer used.

**Step 3: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

**Step 4: Commit**

```bash
git add platform/components/builder-chat.tsx
git commit -m "feat: use Confirmation element for plan approval UX"
```

---

### Task 7: Render StackTrace, Checkpoint, and Commit in generation queue

**Files:**
- Modify: `platform/components/builder-chat.tsx`

**Step 1: Add imports**

```typescript
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
  CommitInfo,
  CommitMessage,
  CommitHash,
  CommitMetadata,
  CommitContent,
  CommitFiles,
  CommitFile,
  CommitFileInfo,
  CommitFileIcon,
  CommitFilePath,
  CommitFileStatus,
} from "@/components/ai-elements/commit";
```

**Step 2: Add state for new event data**

Add to the component state:

```typescript
const [buildErrors, setBuildErrors] = useState<
  { errors: { file: string; line?: number; message: string; raw: string }[] }[]
>([]);
const [checkpoints, setCheckpoints] = useState<
  { label: string; status: "active" | "complete" }[]
>([]);
const [layerCommits, setLayerCommits] = useState<
  { layer: number; hash: string; message: string; files: string[] }[]
>([]);
```

**Step 3: Handle new events in `handleGenerationEvent`**

Add cases to the switch:

```typescript
case "build_error":
  setBuildErrors((prev) => [...prev, { errors: event.errors }]);
  break;
case "checkpoint":
  setCheckpoints((prev) => {
    // Update existing checkpoint or add new
    const idx = prev.findIndex((c) => c.label === event.label);
    if (idx >= 0) {
      const updated = [...prev];
      updated[idx] = { label: event.label, status: event.status };
      return updated;
    }
    return [...prev, { label: event.label, status: event.status }];
  });
  break;
case "layer_commit":
  setLayerCommits((prev) => [
    ...prev,
    { layer: event.layer, hash: event.hash, message: event.message, files: event.files },
  ]);
  break;
```

**Step 4: Render elements in the generation queue section**

Replace the existing generation queue block (the `{generationFiles.length > 0 && (...)}` section) with:

```typescript
{generationFiles.length > 0 && (
  <div className="px-4 py-2 space-y-3">
    {/* Checkpoints */}
    {checkpoints.map((cp) => (
      <Checkpoint key={cp.label}>
        <CheckpointIcon />
        <CheckpointTrigger
          className={cp.status === "complete" ? "text-green-500" : ""}
        >
          {cp.label}
        </CheckpointTrigger>
      </Checkpoint>
    ))}

    {/* File Queue */}
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
    {buildErrors.map((group, i) => (
      <div key={`errors-${i}`} className="space-y-2">
        {group.errors.map((err, j) => (
          <StackTrace key={`${err.file}-${j}`} trace={err.raw || err.message} defaultOpen={j === 0}>
            <StackTraceHeader>
              <StackTraceError>
                <StackTraceErrorType>Build Error</StackTraceErrorType>
                <StackTraceErrorMessage>{err.file}{err.line ? `:${err.line}` : ''}: {err.message}</StackTraceErrorMessage>
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
    ))}

    {/* Layer Commits */}
    {layerCommits.map((lc) => (
      <Commit key={lc.hash}>
        <CommitHeader>
          <CommitInfo>
            <CommitMessage>{lc.message}</CommitMessage>
            <CommitMetadata>
              <CommitHash>{lc.hash}</CommitHash>
            </CommitMetadata>
          </CommitInfo>
        </CommitHeader>
        <CommitContent>
          <CommitFiles>
            {lc.files.map((f) => (
              <CommitFile key={f}>
                <CommitFileInfo>
                  <CommitFileStatus status="added" />
                  <CommitFileIcon />
                  <CommitFilePath>{f}</CommitFilePath>
                </CommitFileInfo>
              </CommitFile>
            ))}
          </CommitFiles>
        </CommitContent>
      </Commit>
    ))}
  </div>
)}
```

**Step 5: Reset state when starting generation**

In `handleStartGeneration`, add resets:

```typescript
setBuildErrors([]);
setCheckpoints([]);
setLayerCommits([]);
```

**Step 6: Verify types compile**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

**Step 7: Commit**

```bash
git add platform/components/builder-chat.tsx
git commit -m "feat: render StackTrace, Checkpoint, and Commit in generation queue"
```

---

### Task 8: Final verification

**Step 1: TypeScript**

Run: `pnpm tsc --noEmit`
Expected: 0 errors

**Step 2: ESLint**

Run: `pnpm eslint lib/types.ts lib/chat-tools.ts lib/generator.ts lib/verifier.ts lib/system-prompt.ts components/builder-chat.tsx app/api/chat/route.ts`
Expected: 0 errors (warnings OK)

**Step 3: Commit all if any unstaged fixes**

```bash
git add -A && git commit -m "fix: lint fixes for AI Elements UX integration"
```
