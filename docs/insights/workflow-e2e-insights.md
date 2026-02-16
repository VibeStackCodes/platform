# E2E Workflow Testing Insights

## Summary

After 12 test runs, the `appGeneration` workflow successfully generated a full-stack bookmarks manager app (24 source files, 2926 lines) with:
- TypeScript typechecking: PASS
- Vite build: PASS
- Lint: FAIL (non-blocking)
- Supabase DB with RLS policies: provisioned
- GitHub repo: created
- Sandbox: running with build output in `/dist/`

## Critical Bugs Fixed

### 1. Mastra Workspace Tools Override Custom Sandbox Tools (Run 9-10)

**Symptom**: Agents called `mastra_workspace_read_file`, `mastra_workspace_list_files` instead of our `readFile`, `listFiles`. All calls failed with `DirectoryNotFoundError: Directory not found: /workspace`.

**Root cause**: Assigning a `Workspace` with `filesystem: new LocalFilesystem(...)` to agents auto-injects Mastra's built-in filesystem tools (`mastra_workspace_*`). These operate on the LOCAL machine, not the Daytona sandbox. The model preferred them over our custom tools because they had more natural names.

**Fix**: Import `WORKSPACE_TOOLS` and disable all filesystem/sandbox tools in the workspace config:
```typescript
const noWorkspaceTools = {
  [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { enabled: false },
  // ... all other FILESYSTEM and SANDBOX tools
}

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: skillsRoot }),
  skills: ['/supabase-js', ...],
  tools: noWorkspaceTools,  // Skills injected, no file tools
})
```

**Lesson**: When using Mastra Workspaces for skills-only injection, always disable the auto-generated filesystem/sandbox tools to prevent tool name collision with custom tools.

### 2. Premature QA Validation on Partial Files (Run 8)

**Symptom**: Sub-agents (backend/frontend) called `qaValidation` workflow (tsc + lint + build) after writing their slice of files. Always failed because other agents hadn't written their files yet.

**Root cause**: `qaWorkflow` was assigned as a workflow-tool to sub-agents. Sub-agents write partial code (e.g., only hooks, no routes) but qaValidation runs full-project `tsc --noEmit && vite build`.

**Fix**:
- Removed `workflows: { qaValidation }` from backend and frontend agents
- Updated agent instructions: "Do NOT attempt to run tsc or build"
- QA only runs as final workflow gate after ALL code is assembled

**Lesson**: Full-project validation is a post-assembly gate, never a per-agent self-check. Only give agents validation tools that work on their isolated slice.

### 3. Code Reviewer Sees Incomplete State (Run 8)

**Symptom**: Code reviewer (PM sub-agent) was called before `integrationStep` wired barrel exports, root routes, and shared imports. Reviewer reported phantom issues.

**Fix**: Moved reviewer from PM sub-agent to a standalone workflow step (`codeReviewStep`) that runs AFTER `integrationStep`:
```
codeGen → integration → code-review → final-qa-gate
```

**Lesson**: Order validation steps after assembly steps. Review code only after all wiring is complete.

### 4. Supabase ACTIVE_HEALTHY Race (Run 8)

**Symptom**: `runMigration` failed with `FATAL: 57P03: the database system is starting up` even though Supabase Management API reported `ACTIVE_HEALTHY`.

**Root cause**: Supabase reports project as ACTIVE_HEALTHY before Postgres is fully ready to accept SQL queries. The Management API health check and actual Postgres readiness have a race window.

**Fix**: Added retry loop in `runMigrationStep` (5 attempts, 10s backoff) for transient errors including:
- `57P03` (Postgres starting up)
- TLS disconnects
- ECONNRESET
- Cloudflare 502/503/524

### 5. Supabase Cloudflare Gateway Errors (Runs 2, 5, 6)

**Symptom**: `createSupabaseProject` returned HTML Cloudflare error page instead of JSON.

**Fix**: Added retry in `createSupabaseStep` (3 attempts, 5s delay) with pattern matching for `cloudflare`, `<html`, `502`, `503`, `524`.

### 6. GitHub Repo Name Collisions (Runs 2-7)

**Symptom**: Repeated test runs created repos with identical slugs (analyst always picked "MarkNest" or "LinkNest", 8-char projectId suffix too short).

**Fix**: `buildRepoName` now uses full projectId: `vibestack-${projectId}`. Added retry with random hex suffix on 422 collision.

### 7. Supabase Project Name Collisions (Run 9)

**Symptom**: Re-triggering workflow with same projectId failed because Supabase project name already exists.

**Fix**: `createSupabaseStep` now appends random suffix on "already exists" error and retries.

### 8. CodeGen Prompt Stale References (Run 11)

**Symptom**: `buildCodeGenPrompt` told PM to "call agent-reviewer" and "call workflow-qaValidation" but those were removed from PM's tools.

**Fix**: Updated prompt to match actual available tools:
```
5. After ALL agents report completion, you are DONE — report completion
6. Do NOT call any build, tsc, lint, or validation tools
```

### 9. Studio File Watcher Kills Running Workflows (Run 11)

**Symptom**: Editing `workflows.ts` during a running workflow triggered Mastra's file watcher, which restarted the dev server and killed the in-flight workflow.

**Lesson**: Never edit source files while a workflow is actively executing in `mastra dev`. Make all code changes before triggering.

## Architecture Insights

### Tool Call Distribution (Successful Run 12)

| Tool | Calls | Notes |
|------|-------|-------|
| readFile | 148+ | Agents read existing files (package.json, tsconfig, etc.) before writing |
| listFiles | 60+ | Directory exploration to understand project structure |
| searchDocs | 40+ | Context7 doc searches for APIs |
| writeFiles | 16+ | Batch file writes (primary write path) |
| createDirectory | 4 | mkdir for src/lib, src/hooks, etc. |
| agent-backend1/2 | 4 each | PM dispatching sub-agents |
| agent-frontend1/2 | 4 each | PM dispatching sub-agents |

### Token Usage

Code generation step (PM + 4 sub-agents): ~32K tokens per sub-agent call. Total for full pipeline: ~200-300K tokens.

### Timing (Successful Run)

| Phase | Duration | Notes |
|-------|----------|-------|
| Analyst | ~15s | 1 LLM call with structured output |
| Infra (parallel) | ~100s | Supabase dominates (90s COMING_UP wait) |
| Schema generation | <1s | Deterministic (contractToSQL + contractToTypes) |
| Write migration | <1s | Upload SQL to sandbox |
| Run migration | ~15s | Including retry window |
| Code generation | ~5-7 min | PM + 4 sub-agents, reading + writing |
| Integration | ~5s | Barrel exports, app layout |
| Code review | ~30s | 1 LLM call |
| Final QA gate | ~30s | tsc + lint + build in sandbox |

**Total: ~10-12 minutes** (dominated by Supabase provisioning + code generation)

## Recommendations

1. **Cache Supabase projects** — reuse existing projects for the same user to skip 90s provisioning
2. **Pre-warm sandbox** — start sandbox creation before analyst completes (pipelining)
3. **Reduce readFile calls** — agents read the same files repeatedly; consider passing file contents in the prompt
4. **Fix lint** — lint failures are non-blocking but should be addressed in integration step
5. **Git push** — deploy workflow should be triggered automatically after QA passes
