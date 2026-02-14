# SonarQube-Style Code Quality Audit Report

**Project:** VibeStack Platform
**Date:** 2026-02-13
**Auditor:** Code Quality Auditor Agent
**Files Reviewed:** 55+ source files (all app/, lib/, components/, middleware, config)
**Severity Scale:** Blocker / Critical / Major / Minor / Info

---

## Executive Summary

| Category | Blocker | Critical | Major | Minor | Info |
|----------|---------|----------|-------|-------|------|
| Bugs | 1 | 3 | 5 | 4 | 0 |
| Code Smells | 0 | 1 | 6 | 8 | 3 |
| Complexity | 0 | 0 | 2 | 3 | 0 |
| Duplication | 0 | 1 | 3 | 2 | 0 |
| Dead Code | 0 | 0 | 1 | 4 | 2 |
| Type Safety | 0 | 2 | 4 | 3 | 0 |
| Error Handling | 0 | 2 | 3 | 3 | 0 |
| Naming | 0 | 0 | 0 | 3 | 2 |
| Architecture | 0 | 1 | 2 | 1 | 0 |
| Security | 1 | 3 | 2 | 0 | 0 |
| Testing | 0 | 1 | 2 | 1 | 0 |
| Performance | 0 | 1 | 3 | 2 | 0 |
| **Total** | **2** | **15** | **33** | **34** | **7** |

**Quality Gate:** FAIL (2 Blockers, 15 Criticals)

---

## 1. BUGS

### BUG-001 — Blocker: `as any` cast in sandbox.ts suppresses type checking on critical API call
**File:** `lib/sandbox.ts:188-189`
**Description:** The `executeSessionCommand` call uses `as any` cast on the options parameter, which means TypeScript cannot verify the shape of the object being passed to the Daytona SDK. If the SDK API changes, this will silently pass invalid data.
```typescript
} as any,
```
**Impact:** Could cause silent runtime failures in sandbox command execution—the core of the generation pipeline.
**Fix:** Define a proper type matching the SDK's expected parameter shape, or use type assertion to a known interface.

### BUG-002 — Critical: Race condition in `generateLayerWithStreaming` accessing shared `generatedContents` map
**File:** `lib/generator.ts:325-393`
**Description:** `Promise.all()` is used to generate all files in a layer concurrently. Each concurrent task reads from `generatedContents` (populated by prior layers) and writes to it. While reads of previous layers are safe, the lack of synchronization means multiple concurrent writes to the same Map could theoretically interleave if any file paths overlap.
**Impact:** Low probability but could cause data corruption in edge cases.
**Fix:** The current architecture where same-layer files don't reference each other mitigates this. Add a comment documenting this invariant, or accumulate results and merge after `Promise.all`.

### BUG-003 — Critical: `supabase-server.ts` swallows cookie-setting errors silently
**File:** `lib/supabase-server.ts:51-53`, `lib/supabase-server.ts:79-83`
**Description:** Both `createClient()` and `createServiceClient()` silently catch and ignore all errors in `setAll()`. While the comment explains this is intentional for Server Components, it also swallows genuine errors in Route Handlers and Server Actions where `setAll()` should work.
```typescript
} catch (error) {
  // The `setAll` method was called from a Server Component.
}
```
**Impact:** Authentication session refresh failures will be silently ignored, potentially causing users to appear logged out unexpectedly.
**Fix:** Log a warning when in a context where `setAll` should work (Route Handlers).

### BUG-004 — Critical: `identifyAffectedFiles` in edit route trusts LLM output without validation
**File:** `app/api/projects/edit/route.ts:270-276`
**Description:** The function parses the LLM response as a JSON array of file paths. If the LLM returns paths that don't exist in the plan, the code silently skips them (line 114-117). However, it could also return paths that match the plan format but reference wrong files, leading to incorrect file regeneration.
```typescript
const filePaths: string[] = JSON.parse(content.trim());
return filePaths;
```
**Impact:** Edit operations could modify wrong files or fail silently.
**Fix:** Validate returned paths against `plan.files` and reject any that don't match.

### BUG-005 — Major: `pluralizeTable` has incorrect pluralization logic
**File:** `lib/entity-extractor.ts:39-43` and `lib/feature-classifier.ts:62-66`
**Description:** The function adds "es" to words ending in "s" (e.g., "status" → "statuses" — correct, but "bus" → "buses" is wrong since it should be "buses"). More critically, "address" → "addresses" is handled correctly but "class" → "classes" is not — it produces "classes" which happens to be correct, but "analysis" → "analysises" is wrong.
**Impact:** Generated Postgres table names could be incorrect for some entity names.
**Fix:** Use a proper pluralization library like `pluralize` from npm.

### BUG-006 — Major: `downloadDirectory` uses regex to strip workspace prefix, which could fail on special chars
**File:** `lib/sandbox.ts:427`
```typescript
const relativePath = filePath.replace(new RegExp(`^${remotePath}/?`), '');
```
**Description:** `remotePath` is not escaped before being used in a RegExp constructor. If `remotePath` contains regex special characters (e.g., paths with `.`, `+`, `(`, etc.), the regex will produce unexpected results.
**Impact:** File paths could be incorrectly relativized during directory download.
**Fix:** Use `String.prototype.startsWith()` and `String.prototype.slice()` instead of regex.

### BUG-007 — Major: `extractCode` in edit route only extracts first code block
**File:** `app/api/projects/edit/route.ts:326-336`
**Description:** The regex `codeBlockRegex` uses a non-global match, so if the LLM returns content with multiple code blocks, only the first is extracted.
**Impact:** Could lose parts of regenerated file content.
**Fix:** Consider using the same `stripMarkdownFences` approach from `generator.ts` which handles start/end fences.

### BUG-008 — Major: `provisionProject` accepts `supabaseClient: any`
**File:** `lib/sandbox.ts:454`
```typescript
export async function provisionProject(
  projectId: string,
  appName: string,
  supabaseClient: any,
): Promise<void> {
```
**Description:** The `any` type eliminates all type safety for the Supabase client parameter.
**Impact:** Any incorrect usage of the Supabase client in this function won't be caught at compile time.
**Fix:** Import and use the proper Supabase client type.

### BUG-009 — Major: SSE stream in generate route never sends heartbeat/keep-alive
**File:** `app/api/projects/generate/route.ts:59-208`
**Description:** The SSE stream can be open for up to 5 minutes (`maxDuration = 300`). During long-running operations (sandbox creation, build verification), no events are emitted for extended periods. Intermediate proxies (Vercel, Cloudflare, nginx) may close idle connections.
**Impact:** Generation could appear to fail when it's actually still running, due to connection timeout.
**Fix:** Add periodic heartbeat comments (`:\n\n`) to the SSE stream.

### BUG-010 — Minor: `LAYER_LABELS` in generator.ts only covers layers 0-5
**File:** `lib/generator.ts:10-17`
**Description:** If a plan has more than 6 layers, layers 6+ will show as "files" in the UI instead of descriptive labels.
**Impact:** Minor UI clarity issue.

### BUG-011 — Minor: `chat/route.ts` creates a second Supabase client for provisioning
**File:** `app/api/chat/route.ts:49`
**Description:** A second `createClient()` call is made inside the `if (userMessages.length === 1)` block, creating an unnecessary second server client instance.
**Impact:** Minor performance overhead from duplicate client creation.

### BUG-012 — Minor: Mock mode in generate route skips auth entirely
**File:** `app/api/projects/generate/route.ts:41-43`
**Description:** When `MOCK_MODE` is true, the authentication check is completely skipped, including the creation of a project record. This means mock mode doesn't exercise the same code paths as production.
**Impact:** Mock mode may not catch auth-related regressions.

### BUG-013 — Minor: `_projectId` is extracted but prefixed with underscore
**File:** `app/api/chat/route.ts:35`
```typescript
const { messages, projectId: _projectId, model: modelId = 'claude-sonnet-4-5-20250929' } =
```
**Description:** `projectId` is renamed to `_projectId` (suggesting unused), but it IS used on line 48. The underscore prefix is misleading.
**Fix:** Remove the underscore prefix.

---

## 2. CODE SMELLS

### SMELL-001 — Critical: `builder-chat.tsx` is a 662-line monolith component
**File:** `components/builder-chat.tsx`
**Description:** This single component handles chat state management, SSE stream parsing, generation orchestration, message rendering with 8+ tool types, and file progress tracking. Cyclomatic complexity is very high.
**Impact:** Extremely difficult to maintain, test, or modify. Any change risks breaking unrelated functionality.
**Fix:** Extract into smaller components: `ChatMessageRenderer`, `GenerationTracker`, `ToolRenderer`, custom hooks like `useGeneration`, `useSSEStream`.

### SMELL-002 — Major: Duplicated `pluralizeTable` function
**File:** `lib/entity-extractor.ts:39-43` AND `lib/feature-classifier.ts:62-66` AND `lib/template-registry.ts:19-22`
**Description:** The exact same pluralization logic is implemented three times across three files.
**Fix:** Extract to a shared utility in `lib/utils.ts` or use the `pluralize` npm package.

### SMELL-003 — Major: Duplicated markdown fence stripping logic
**File:** `lib/generator.ts:419-433`, `lib/batch-generator.ts:177-180`, `lib/verifier.ts:540-543`, `lib/verifier.ts:559-562`, `lib/planner.ts:219-223`, `lib/requirement-check.ts:108-111`, `lib/requirement-check.ts:288-290`
**Description:** The pattern `if (content.startsWith('```')) { content = content.replace(...) }` is repeated 7+ times across the codebase.
**Fix:** Extract a shared `stripMarkdownFences()` utility (one already exists in `generator.ts` but isn't exported/reused).

### SMELL-004 — Major: Feature envy in `generate/route.ts`
**File:** `app/api/projects/generate/route.ts`
**Description:** This route handler directly orchestrates sandbox creation, Supabase project creation, template pipeline, build verification, GitHub push, preview URL generation, and database updates. It has too much knowledge of too many subsystems.
**Fix:** Extract an `orchestrator.ts` module that coordinates the generation pipeline.

### SMELL-005 — Major: `supabase-mgmt.ts` has SQL injection patterns in `setupSchema`
**File:** `lib/supabase-mgmt.ts:314-325`
**Description:** While `SupabaseSchema` path validates table/bucket names with regex, the `DatabaseSchema` path constructs SQL directly from `table.name` and `col.name` without any validation or parameterization:
```typescript
const createTableSql = `CREATE TABLE IF NOT EXISTS ${table.name} (${columns});`;
```
**Impact:** If `table.name` is attacker-controlled, this is a SQL injection vulnerability.
**Fix:** Apply the same regex validation (`/^[a-z0-9_]+$/`) to all identifiers in the `DatabaseSchema` path.

### SMELL-006 — Major: `edit/route.ts` instantiates `Anthropic` client twice
**File:** `app/api/projects/edit/route.ts:107-108` and `app/api/projects/edit/route.ts:234`
**Description:** Two separate `new Anthropic()` instances are created—one in the main handler and one in `identifyAffectedFiles`.
**Fix:** Create a single shared instance or use a factory function.

### SMELL-007 — Major: Magic numbers throughout the codebase
**File:** Multiple locations
**Examples:**
- `maxOutputTokens: 8000` (generator.ts:349, verifier.ts:553, requirement-check.ts:101)
- `maxOutputTokens: 16384` (chat/route.ts:68)
- `max_tokens: 4096` (edit/route.ts:133)
- `max_tokens: 1024` (edit/route.ts:259)
- `temperature: 0.7`, `0.3`, `0.5`, `1.0` (various files)
- `maxAttempts: 60`, `pollInterval: 5000` (multiple files)
**Fix:** Define named constants in a shared config module.

### SMELL-008 — Minor: Excessive `console.log` statements throughout production code
**File:** Nearly every lib/ file
**Description:** The codebase uses `console.log`, `console.warn`, and `console.error` extensively for logging. In production, these will go to stdout without structured formatting or log levels.
**Fix:** Implement a structured logger (e.g., `pino`) with proper log levels and JSON output.

### SMELL-009 — Minor: `models.ts:57-58` has a "magic fallback"
**File:** `lib/models.ts:57-58`
```typescript
default:
  return anthropic(modelId);
```
**Description:** Unknown model IDs silently fall through to Anthropic, which will fail at runtime.
**Fix:** Throw an error for unrecognized model IDs.

### SMELL-010 — Minor: OpenAI client import at bottom of file
**File:** `lib/openai-client.ts:85`
```typescript
import { withRetry, type RetryOptions } from './retry';
```
**Description:** This import is placed after the function definitions, breaking the standard convention of imports at the top.
**Fix:** Move import to the top of the file.

### SMELL-011 — Minor: `handleStartGeneration` recreated every render
**File:** `components/builder-chat.tsx:211`
**Description:** While `useCallback` is used, the dependency array `[projectId, model]` means the callback is recreated on model change. The `handleGenerationEvent` function it calls internally is NOT memoized.
**Fix:** Move `handleGenerationEvent` to a `useCallback` or `useRef`.

### SMELL-012 — Minor: Inconsistent error handling patterns
**File:** Various
**Description:** Some functions throw errors, some return null, some log and continue. For example:
- `parseBuildErrors` returns empty array on no errors found
- `analyzeErrors` returns null on failure
- `identifyAffectedFiles` returns empty array on parse failure
**Fix:** Establish and document a consistent error handling pattern.

### SMELL-013 — Minor: Inconsistent naming of `MOCK_MODE` constant
**File:** Various
**Description:** `MOCK_MODE` is defined independently in 4 files: `chat/route.ts`, `chat/messages/route.ts`, `generate/route.ts`, `project/[id]/page.tsx`, `supabase-server.ts`. All read from the same env var.
**Fix:** Define once in a shared module.

### SMELL-014 — Minor: `AVAILABLE_SKILLS` array in planner.ts is hardcoded
**File:** `lib/planner.ts:26-39`
**Description:** The list of available skills is hardcoded. If skills are added/removed from the `skills/` directory, this list must be manually updated.
**Fix:** Auto-discover skills from the filesystem at startup.

### SMELL-015 — Info: `MOCK_PLAN` alias export
**File:** `lib/mock-data.ts:64`
```typescript
export const MOCK_PLAN = MOCK_CHAT_PLAN;
```
**Description:** Backward compatibility alias for a renamed export. This is dead weight if nothing uses `MOCK_PLAN` anymore.
**Fix:** Search for usages and remove if unused.

### SMELL-016 — Info: `getMockFileContent` returns minimal stubs
**File:** `lib/mock-data.ts:70-90`
**Description:** Only one file path has a realistic stub; all others get `// Generated: ${path}\nexport {};`. This limits the usefulness of mock mode for visual testing.

### SMELL-017 — Info: Inline `new ReadableStream` creation in mock chat handler
**File:** `app/api/chat/route.ts:89-98, 139-145`
**Description:** Stream construction logic is duplicated between `toolCallStreamResult` and the edit text response in `buildMockChatResponse`.

---

## 3. COMPLEXITY

### COMPLEX-001 — Major: `verifyAndFix` function has high cyclomatic complexity (~25)
**File:** `lib/verifier.ts:241-395`
**Description:** This function contains a while loop with multiple conditional branches: OpenAI vs fallback error analysis, structured vs regex error parsing, file iteration with try/catch, retry delay logic. The function spans 155 lines.
**Fix:** Decompose into smaller functions: `attemptBuild`, `parseErrors`, `applyFixes`.

### COMPLEX-002 — Major: `buildMockChatResponse` in chat/route.ts
**File:** `app/api/chat/route.ts:110-162`
**Description:** This function has a 5-branch conditional chain based on `turnNumber`, each constructing different stream results. The mock logic is interleaved with production code in the same file.
**Fix:** Move mock handlers to a separate `lib/mock-chat.ts` module.

### COMPLEX-003 — Minor: Deeply nested JSX in BuilderChat message rendering
**File:** `components/builder-chat.tsx:325-551`
**Description:** The message rendering switch statement in the JSX has 6 case branches, each returning complex nested component trees (up to 8 levels of nesting). This is inside `messages.map()` which is inside a ternary.
**Fix:** Extract each tool case into its own component (e.g., `ThinkingStepsRenderer`, `PlanRenderer`, `QuestionRenderer`).

### COMPLEX-004 — Minor: `setupSchema` has two completely different code paths
**File:** `lib/supabase-mgmt.ts:266-370`
**Description:** The function handles both `SupabaseSchema` (raw SQL) and `DatabaseSchema` (structured) formats with entirely different logic. These should be two separate functions.

### COMPLEX-005 — Minor: `extractRelevantErrors` iterates lines 3 times
**File:** `lib/verifier.ts:46-98`
**Description:** The function iterates through lines once to find error indices, then iterates the error indices to add context, then sorts and joins. While readable, this could be optimized for very large build outputs.

---

## 4. DUPLICATION

### DUP-001 — Critical: `pluralizeTable` implemented 3 times
**File:** `lib/entity-extractor.ts:39-43`, `lib/feature-classifier.ts:62-66`, `lib/template-registry.ts:19-22`
**Description:** Identical pluralization logic copy-pasted across 3 files.
**Fix:** Extract to `lib/utils.ts`.

### DUP-002 — Major: Markdown fence stripping repeated 7+ times
**File:** `generator.ts`, `batch-generator.ts`, `verifier.ts` (2x), `planner.ts`, `requirement-check.ts` (2x)
**Description:** Same regex pattern for stripping markdown fences.
**Fix:** Export `stripMarkdownFences` from `generator.ts` and reuse everywhere.

### DUP-003 — Major: Error message formatting pattern
**File:** Nearly every function
```typescript
error instanceof Error ? error.message : String(error)
```
**Description:** This exact pattern appears 20+ times across the codebase.
**Fix:** Create a `getErrorMessage(error: unknown): string` utility.

### DUP-004 — Major: Supabase client creation pattern
**File:** `supabase-server.ts:38-60` and `supabase-server.ts:69-89`
**Description:** `createClient()` and `createServiceClient()` have identical cookie handling logic (getAll/setAll with try/catch). Only the key parameter differs.
**Fix:** Extract shared cookie adapter factory.

### DUP-005 — Minor: SSE response creation pattern
**File:** `app/api/projects/generate/route.ts:201-208` and `generate/route.ts:281-288`
**Description:** Both the real and mock paths create SSE responses with identical headers.
**Fix:** Extract a `createSSEResponse(stream)` helper.

### DUP-006 — Minor: Poll-until-ready pattern
**File:** `lib/supabase-mgmt.ts:154-198`, `app/api/projects/deploy/route.ts:305-343`, `lib/sandbox.ts:263-292`
**Description:** Three separate polling loops with very similar structure (max attempts, poll interval, status check, timeout error).
**Fix:** Create a generic `pollUntilReady()` utility.

---

## 5. DEAD CODE

### DEAD-001 — Major: `classifyFeatures` and `executeTemplate` imported but only used in mock path
**File:** `app/api/projects/generate/route.ts:15-16`
```typescript
import { classifyFeatures } from "@/lib/feature-classifier";
import { executeTemplate } from "@/lib/template-registry";
```
**Description:** These imports are used only in `buildMockGenerateResponse`. In production, the template pipeline runs inside `runPipeline`. This means these imports add to bundle size for the generate route unnecessarily.
**Impact:** Minor bundle size increase.
**Fix:** Dynamic import inside `buildMockGenerateResponse`.

### DEAD-002 — Minor: `_projectId` naming suggests unused variable
**File:** `app/api/chat/route.ts:35`
**Description:** Destructured as `_projectId` but actually used. Misleading convention.

### DEAD-003 — Minor: `eval-logger.ts` functions are never called
**File:** `lib/eval-logger.ts`
**Description:** Grep reveals no imports of `eval-logger` from any other file. The entire module appears to be unused.
**Fix:** Either integrate into the pipeline or remove.

### DEAD-004 — Minor: `requirement-check.ts` is not called from generate route
**File:** `lib/requirement-check.ts`
**Description:** The `runPlaywrightCheck` function exists but is never called from the generation pipeline (`generate/route.ts`). The pipeline goes: template → verifyAndFix → complete. Requirement checking is skipped.
**Fix:** Either integrate into the pipeline or document why it's currently disabled.

### DEAD-005 — Minor: `shadcn-installer.ts` strips "use client" for Vite SPA
**File:** `lib/shadcn-installer.ts:51`
```typescript
content = content.replace(/^"use client"\n\n?/, '');
```
**Description:** The comment says "not needed in Vite SPA" but the platform is a Next.js app (not Vite SPA). The `CODEGEN_SYSTEM_PROMPT` mentions "React 19 + Vite" but the actual platform uses Next.js. This stripping may be for generated apps (which use Vite), but it's confusing in the platform context.

### DEAD-006 — Info: `MOCK_PLAN` alias is likely unused
**File:** `lib/mock-data.ts:64`

### DEAD-007 — Info: `prompt` parameter is optional in `GenerateRequest` but also extracted as `prompt` from body
**File:** `lib/types.ts:269`, `app/api/projects/generate/route.ts:31`

---

## 6. TYPE SAFETY

### TYPE-001 — Critical: Multiple non-null assertions on environment variables
**File:** `lib/supabase-server.ts:39-40`, `lib/supabase-browser.ts:9-10`, `middleware.ts:20-21`, `app/api/stripe/checkout/route.ts:10`, `app/api/stripe/webhook/route.ts:10,15`
```typescript
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
process.env.STRIPE_SECRET_KEY!,
process.env.STRIPE_WEBHOOK_SECRET!
```
**Description:** Non-null assertions (`!`) on environment variables throughout the codebase. If any env var is missing, the app crashes with an unhelpful error.
**Fix:** Create an `env.ts` module that validates all required env vars at startup and provides typed access.

### TYPE-002 — Critical: `as any` casts in multiple locations
**File:** `lib/sandbox.ts:189`, `app/api/chat/route.ts:151`, `lib/requirement-check.ts:75`, `lib/supabase-mgmt.ts:173`
**Description:** `as any` casts bypass all type checking. Notable occurrences:
- `sandbox.ts:189` — Suppresses type checking on SDK API call
- `chat/route.ts:151` — `doStream: streamResult as any` loses mock type safety
- `supabase-mgmt.ts:173` — `(k: any) => k.name === "anon"` loses type info
**Fix:** Define proper types for each.

### TYPE-003 — Major: `generationState` field typed as `JSONB` without validation
**File:** `app/api/projects/edit/route.ts:183`
```typescript
const updatedGenerationState = project.generation_state as GenerationState;
```
**Description:** The `project.generation_state` comes from the database (JSONB column) and is cast directly to `GenerationState` without any runtime validation. If the stored JSON doesn't match the interface shape, runtime errors will occur.
**Fix:** Use Zod schema to validate at runtime before casting.

### TYPE-004 — Major: `project.plan` from database is not validated
**File:** `app/api/projects/edit/route.ts:69`
```typescript
const plan: Plan = project.plan;
```
**Description:** Same issue as TYPE-003 — JSONB field from database cast directly to a TypeScript type.

### TYPE-005 — Major: `chatPlan` stored in database as-is
**File:** `app/api/projects/generate/route.ts:76`
```typescript
plan: chatPlan,
```
**Description:** The `chatPlan` from the request body is stored directly in the database `plan` column without Zod validation. The `ChatPlanSchema` exists in `schemas.ts` but is never used for request validation.
**Fix:** Validate `chatPlan` against `ChatPlanSchema` before storing.

### TYPE-006 — Major: `parts` casting in project page
**File:** `app/project/[id]/page.tsx:54`
```typescript
parts: (typeof row.parts === "string" ? JSON.parse(row.parts) : row.parts) as Array<Record<string, unknown>>,
```
**Description:** Unsafe cast of database JSONB to `Array<Record<string, unknown>>` without validation.

### TYPE-007 — Minor: `payload.new` cast in ProjectLayout
**File:** `components/project-layout.tsx:49`
```typescript
const row = payload.new as Record<string, unknown>;
```
**Description:** Realtime event payload cast without validation.

### TYPE-008 — Minor: `useChat` messages cast
**File:** `components/builder-chat.tsx:121`
```typescript
messages: initialMessages as UIMessage[] | undefined,
```
**Description:** Unsafe cast of initial messages to `UIMessage[]`.

### TYPE-009 — Minor: `data.user!.id` non-null assertion after sign-up
**File:** `app/auth/login/page.tsx:72,84`
```typescript
await redirectAfterAuth(supabase, data.user!.id);
```
**Description:** Non-null assertion on `data.user` after successful auth. While logically sound (successful auth implies user exists), the `!` is fragile.

---

## 7. ERROR HANDLING

### ERR-001 — Critical: Generate route error handler doesn't close SSE stream properly on all paths
**File:** `app/api/projects/generate/route.ts:183-197`
**Description:** If `controller.close()` throws (e.g., stream already aborted by client), the error handler itself will throw unhandled.
**Fix:** Wrap `controller.close()` in try/catch.

### ERR-002 — Critical: `provisionProject` is fire-and-forget with `.catch(console.error)`
**File:** `app/api/chat/route.ts:56`
```typescript
provisionProject(_projectId, promptText.slice(0, 50), supabase).catch(console.error);
```
**Description:** If provisioning fails, there's no mechanism to retry or notify the user. The generate route does have a fallback to create a new sandbox, but the failed provisioning may have left partial state (e.g., a Supabase project without a sandbox).
**Fix:** At minimum, update the project status in the catch handler to indicate provisioning failure.

### ERR-003 — Major: `verifyAndFix` returns `false` for unparseable errors instead of throwing
**File:** `lib/verifier.ts:312-324`
**Description:** When build fails but no errors can be parsed, the function returns `false` without attempting any fix. The caller (generate route) doesn't handle `false` return—it just continues to GitHub push and completion.
**Fix:** The generate route should check `verifyAndFix` return value and emit appropriate events.

### ERR-004 — Major: Deploy route doesn't clean up on partial failure
**File:** `app/api/projects/deploy/route.ts:82-93`
**Description:** If `deployFromGitHub` fails after creating the Vercel project, the project is left in a partially-created state. Similarly, if `deployToVercel` fails after downloading files, no cleanup occurs.

### ERR-005 — Major: `setupSchema` swallows individual migration failures
**File:** `lib/supabase-mgmt.ts:266-370`
**Description:** Each migration is run independently and errors are captured in results. But the caller doesn't check for failures — it just continues. A failed migration (e.g., CREATE TABLE) means subsequent migrations (e.g., RLS policies) will also fail.
**Fix:** Add a `bail-on-error` option or at least log warnings prominently.

### ERR-006 — Minor: Generic `catch {}` blocks without error logging
**File:** `app/api/chat/route.ts:244`, `app/api/projects/generate/route.ts:249`, `lib/shadcn-installer.ts:57`
**Description:** Empty catch blocks or catch-and-continue without logging.

### ERR-007 — Minor: `handleDeploy` in BuilderPreview doesn't show errors to user
**File:** `components/builder-preview.tsx:26-43`
```typescript
} catch (error) {
  console.error("Deployment error:", error);
}
```
**Description:** Deploy errors are only logged to console, not shown in the UI.
**Fix:** Add toast notification or error state.

### ERR-008 — Minor: HeroPrompt silently fails on project creation error
**File:** `components/hero-prompt.tsx:39-41`
```typescript
if (error || !project) {
  console.error("Failed to create project:", error);
  return;
}
```
**Description:** No user feedback when project creation fails.

---

## 8. NAMING

### NAME-001 — Minor: `_projectId` underscore prefix is misleading
**File:** `app/api/chat/route.ts:35`
**Description:** Convention suggests unused variable, but it IS used.

### NAME-002 — Minor: `mgmtFetch` is abbreviated
**File:** `lib/supabase-mgmt.ts:73`
**Description:** `mgmtFetch` could be clearer as `fetchManagementAPI` or `supabaseManagementFetch`.

### NAME-003 — Minor: `FIX_MODEL` vs `FAST_MODEL` naming isn't descriptive
**File:** `lib/openai-client.ts:39-42`
**Description:** `FIX_MODEL` is used for both build fixing and requirement fixing. `FAST_MODEL` is used for test generation. Better names might be `ERROR_FIX_MODEL` and `LIGHTWEIGHT_MODEL`.

### NAME-004 — Info: Mix of American/British spelling: `colour` vs `color`
**Not found** — consistent American English throughout.

### NAME-005 — Info: Inconsistent file naming — some files use kebab-case, others camelCase
**File:** lib/ directory
**Description:** `supabase-server.ts` (kebab) vs `openai-client.ts` (kebab) vs `evalLogger.ts` (camel) — actually all are kebab-case. Consistent.

---

## 9. ARCHITECTURE

### ARCH-001 — Critical: No input validation on API route request bodies
**File:** `app/api/chat/route.ts:36-40`, `app/api/projects/generate/route.ts:30-31`, `app/api/projects/edit/route.ts:24`, `app/api/projects/deploy/route.ts:21`
**Description:** All API routes use `await req.json()` with type assertion but no runtime validation:
```typescript
const body: GenerateRequest = await req.json();
```
The `ChatPlanSchema`, `PlanSchema`, etc. exist in `schemas.ts` but are never used for request validation.
**Impact:** Invalid payloads will cause unpredictable runtime errors deep in the pipeline.
**Fix:** Use Zod schemas to validate all incoming request bodies at the API boundary.

### ARCH-002 — Major: `edit/route.ts` uses Anthropic SDK directly instead of models abstraction
**File:** `app/api/projects/edit/route.ts:8,107,234`
```typescript
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```
**Description:** While `lib/models.ts` provides a `resolveModel()` abstraction, the edit route bypasses it entirely and uses the Anthropic SDK directly. This means the model selector in the UI has no effect on the edit route — it always uses Anthropic.
**Impact:** Users selecting OpenAI models cannot use them for edits.
**Fix:** Use `resolveModel()` and AI SDK `generateText()` for consistency, or add OpenAI path.

### ARCH-003 — Major: No rate limiting on API routes
**File:** All API routes
**Description:** No rate limiting is implemented on any API route. A single user could spam the generation endpoint, creating dozens of sandboxes and Supabase projects.
**Impact:** Resource exhaustion, cost escalation.
**Fix:** Implement rate limiting middleware (e.g., using `@upstash/ratelimit` with Supabase or Redis).

### ARCH-004 — Minor: `system-prompt.ts` has two system prompts for different architectures
**File:** `lib/system-prompt.ts:8-92,94-124`
**Description:** `BUILDER_SYSTEM_PROMPT` is for Next.js App Router + Supabase SSR, but `CODEGEN_SYSTEM_PROMPT` describes React 19 + Vite + client-side Supabase. These describe two different architectures and could confuse the generation pipeline.

---

## 10. SECURITY

### SEC-001 — Blocker: SQL injection in `setupSchema` for DatabaseSchema path
**File:** `lib/supabase-mgmt.ts:314-325`
**Description:** Table names and column names from `DatabaseSchema` are interpolated directly into SQL without validation:
```typescript
const createTableSql = `CREATE TABLE IF NOT EXISTS ${table.name} (${columns});`;
```
The `SupabaseSchema` path validates table names (line 284), but the `DatabaseSchema` path does NOT.
**Impact:** If `table.name` contains malicious SQL (e.g., `users; DROP TABLE projects;`), it will execute arbitrary SQL against the Supabase project.
**Fix:** Apply regex validation to all identifiers.

### SEC-002 — Critical: `CODEGEN_SYSTEM_PROMPT` tells AI to use Supabase credentials from env
**File:** `lib/injector.ts:152-153`
```typescript
const supabaseContext = `\n\n## SUPABASE CONFIGURATION\n\nUse these Supabase credentials:\n- URL: ${supabaseUrl}\n- Anon Key: ${supabaseAnonKey}\n...`;
```
**Description:** Actual Supabase credentials (URL and anon key) are injected into AI prompts. While the anon key is designed to be public, this establishes a pattern where secrets could accidentally be included in prompts.
**Impact:** The credentials will be sent to the AI provider's API and stored in their logs.

### SEC-003 — Critical: `Stripe` initialized with non-null assertion on secret key
**File:** `app/api/stripe/checkout/route.ts:10`, `app/api/stripe/webhook/route.ts:10`
```typescript
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
```
**Description:** If `STRIPE_SECRET_KEY` is not set, this will create a Stripe client with `undefined` as the key, which may produce confusing errors instead of a clear "missing key" error.

### SEC-004 — Critical: Webhook secret uses non-null assertion
**File:** `app/api/stripe/webhook/route.ts:15`
```typescript
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
```
**Description:** If the webhook secret is missing, signature verification will fail with a confusing error.
**Fix:** Validate at startup or throw a clear error.

### SEC-005 — Major: Password generation in `supabase-mgmt.ts` uses `Math.random()`
**File:** `lib/supabase-mgmt.ts:123-128`
```typescript
Array.from({ length: 24 }, () =>
  "abcdefghijklmnopqrstuvwxyz...".charAt(
    Math.floor(Math.random() * 68)
  )
).join("");
```
**Description:** `Math.random()` is not cryptographically secure. Database passwords should use `crypto.randomBytes()` or `crypto.getRandomValues()`.
**Impact:** Predictable passwords for generated Supabase projects.
**Fix:** Use `crypto.randomUUID()` or `crypto.randomBytes(24).toString('base64url')`.

### SEC-006 — Major: Auth callback doesn't validate redirect
**File:** `app/auth/callback/route.ts:11`
**Description:** After auth, the user is always redirected to `/dashboard`. However, the error case redirects to `${origin}/?error=${error.message}`. The `error.message` is not URL-encoded or sanitized, which could enable XSS via reflected error messages.
**Fix:** Use `encodeURIComponent(error.message)`.

---

## 11. TESTING

### TEST-001 — Critical: Minimal test coverage
**File:** `tests/` directory
**Description:** Only 2 test files exist: `tests/setup.ts` (env setup) and `tests/e2e/generate.test.ts`. The `e2e/` directory has 2 Playwright spec files. There are ZERO unit tests for the core lib modules (`generator.ts`, `planner.ts`, `verifier.ts`, `injector.ts`, etc.).
**Impact:** No regression protection for the most critical business logic.
**Fix:** Add unit tests for: `parseBuildErrors`, `validatePlan`, `stripMarkdownFences`, `pluralizeTable`, `buildFilePrompt`, `groupFilesByLayer`, `extractRelevantErrors`, `hexToHsl`.

### TEST-002 — Major: Test setup exposes mock credentials
**File:** `tests/setup.ts:7-10`
```typescript
process.env.ANTHROPIC_API_KEY = 'test-api-key';
process.env.DAYTONA_API_KEY = 'test-daytona-key';
```
**Description:** While these are test values, they establish a pattern of putting credentials in committed code. Anyone grep'ing for `API_KEY` will find these.

### TEST-003 — Major: `eval-logger.ts` and `requirement-check.ts` are untested and unused
**File:** `lib/eval-logger.ts`, `lib/requirement-check.ts`
**Description:** These modules were written but never integrated into the pipeline or tested. They represent unused code that adds maintenance burden.

### TEST-004 — Minor: No test for Stripe webhook signature verification
**File:** `app/api/stripe/webhook/route.ts`
**Description:** Webhook handling is security-critical but has no tests verifying signature validation works correctly.

---

## 12. PERFORMANCE

### PERF-001 — Critical: `downloadDirectory` downloads all files in parallel without concurrency limit
**File:** `lib/sandbox.ts:422-433`
```typescript
const files = await Promise.all(
  filePaths.map(async (filePath) => {
    const content = await downloadFile(sandbox, filePath);
    ...
  })
);
```
**Description:** If a project has hundreds of files, this creates hundreds of concurrent HTTP requests to the Daytona sandbox API, which could overwhelm the sandbox or hit rate limits.
**Fix:** Use `p-limit` or similar to cap concurrency at 10-20 parallel downloads.

### PERF-002 — Major: `buildFilePrompt` includes full dependency file contents in every prompt
**File:** `lib/injector.ts:130-138`
**Description:** For files with many dependencies, the entire content of each dependency is included in the prompt. For a layer-3 file that depends on 5 files, each ~200 lines, that's ~1000 lines of context per prompt. With 10 files in a layer, that's 10,000 lines of context being sent to the AI.
**Impact:** Dramatically increases token usage and cost.
**Fix:** Consider providing type signatures/exports only instead of full file contents.

### PERF-003 — Major: `glob.sync` used for skill discovery in `injector.ts`
**File:** `lib/injector.ts:47,60`
**Description:** `glob.sync` is a blocking synchronous filesystem operation called during file generation. If the skills directory is large, this blocks the event loop.
**Fix:** Use async `glob()` or cache the skill discovery results at startup.

### PERF-004 — Major: `setupSchema` executes migrations sequentially (not batched)
**File:** `lib/supabase-mgmt.ts:273-310`
**Description:** Each migration SQL statement is sent as a separate HTTP request to the Supabase Management API. For a schema with 10 tables, 10 RLS policies, and seed data, that's 20+ sequential HTTP requests.
**Fix:** Batch SQL statements into a single migration request where possible.

### PERF-005 — Minor: `findSkillContent` reads files synchronously
**File:** `lib/injector.ts:41-66`
**Description:** `readFileSync` and `existsSync` are used for skill file reading. These are blocking operations called during generation.

### PERF-006 — Minor: `loadTemplateDir` walks directory synchronously
**File:** `lib/template-registry.ts:40-61`
**Description:** Uses `readdirSync` and `readFileSync` for template loading. Should be cached or made async.

---

## Recommendations (Priority Order)

### Immediate (Blockers + Critical)
1. Fix SQL injection in `setupSchema` DatabaseSchema path (SEC-001)
2. Add Zod validation for all API request bodies (ARCH-001)
3. Replace `Math.random()` with `crypto` for password generation (SEC-005)
4. Replace `!` non-null assertions on env vars with validated `env.ts` module (TYPE-001)
5. Fix `as any` casts with proper types (TYPE-002, BUG-001)
6. Add rate limiting to API routes (ARCH-003)
7. URL-encode error messages in auth callback (SEC-006)
8. Add unit tests for core lib functions (TEST-001)

### Short Term (Major)
9. Extract `pluralizeTable` and `stripMarkdownFences` to shared utils (DUP-001, DUP-002)
10. Break up `builder-chat.tsx` monolith (SMELL-001)
11. Make edit route model-agnostic (ARCH-002)
12. Add concurrency limits to `downloadDirectory` (PERF-001)
13. Add SSE heartbeat to prevent connection timeouts (BUG-009)
14. Validate database JSONB fields at runtime (TYPE-003, TYPE-004, TYPE-005)
15. Integrate or remove `eval-logger.ts` and `requirement-check.ts` (DEAD-003, DEAD-004)
16. Replace `console.log` with structured logger (SMELL-008)

### Medium Term (Minor + Info)
17. Extract `getErrorMessage` utility (DUP-003)
18. Create generic `pollUntilReady` utility (DUP-006)
19. Extract `MOCK_MODE` to shared module (SMELL-013)
20. Define named constants for magic numbers (SMELL-007)
21. Cache template and skill file reads (PERF-005, PERF-006)
22. Use proper pluralization library (BUG-005)

---

*Report generated by automated code quality analysis. All findings should be verified by the development team before taking action.*
