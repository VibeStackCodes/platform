# Agent-First CLAUDE.md Template

Copy the template below into any project's `CLAUDE.md`. Replace all `{{placeholders}}` with project-specific values. Delete sections that don't apply.

---

```markdown
# {{project-name}}

{{one-line description of what this project does}}

## Task Execution Protocol

1. Read `CODEBASE.yaml` at project root to find the relevant module
2. Read that module's `MODULE.md` to find the right file
3. Read the implementation file + its co-located `.test.ts`
4. Make the change
5. Run the test: `{{test-command}} <path-to-test-file>`
6. Update `MODULE.md` if you changed: exports, dependencies, error modes, or gotchas
7. Run `{{sync-types-command}}` if you modified any type in `contract.ts`

## Commands

{{test-command}}           # Run specific test
{{test-all-command}}       # Run all tests
{{typecheck-command}}      # Type check
{{lint-command}}           # Lint
{{sync-types-command}}     # Sync golden types to contract.ts copies
{{validate-module-command}} # Validate MODULE.md accuracy

## Module Structure

Every capability module lives at `capabilities/<name>/` and contains:

| File | Purpose |
|------|---------|
| `MODULE.md` | Machine-readable manifest — read this FIRST |
| `contract.ts` | Types + function signatures — the ONLY file other modules may import |
| `<function-name>.ts` | One exported function per file, kebab-case matching function name |
| `<function-name>.test.ts` | Co-located test for the adjacent implementation file |

## Naming Rules

### Files
- Verb-noun kebab-case matching the exported function
- Example: `create-sandbox-from-snapshot.ts` exports `createSandboxFromSnapshot()`

### Functions
- camelCase, globally unique, domain-qualified
- Must return exactly 1 result when grepped across the codebase
- Good: `createDaytonaSandboxFromSnapshot()` / Bad: `create()`

### Types
- PascalCase, domain-qualified
- Good: `SandboxCreationConfig` / Bad: `Config`

### Errors
- `<Module><Description>Error` with all diagnostic values in message
- Good: `DaytonaSandboxPollingTimeoutError("Sandbox abc not ready after 20000ms")`
- Bad: `new Error("timeout")`

## When Modifying Code

- NEVER import from another module's internal files — only from `contract.ts`
- NEVER import from barrel `index.ts` files — import from the actual file
- ALWAYS run the co-located test after changes: `{{test-command}} <path>`
- ALWAYS update `MODULE.md` when changing: exports, dependencies, error modes
- If a type is used in only ONE file, define it inline — not in `contract.ts`
- If you need a type from another module, import from their `contract.ts`
  — or duplicate it in your own `contract.ts` (duplication > coupling)

## Cross-Module Changes

If your change modifies a `contract.ts` that other modules import:

1. Grep for all importers: `Grep("from.*<module-name>/contract")`
2. Update all importing modules in the same commit
3. Run tests for ALL affected modules, not just yours
4. If you modified a type with a `@synced-from` annotation, run `{{sync-types-command}}`

## Code Style

- Flat control flow — no middleware chains, base classes, or mixins
- Explicit imports — no auto-discovery, magic registries, or dynamic `require()`
- Standalone functions over classes — unless the domain genuinely needs state
- `if/else` over ternaries for multi-branch logic
- Max ~150 lines per file — if longer, split by responsibility
- Every function should be understandable by reading only its file, top to bottom, once

## Parallel Agent Rules

- One function per file = two agents rarely touch the same file
- `contract.ts` is append-only — add new exports, never modify existing signatures
- `MODULE.md` is append-only — add rows to file table, update your own entries
- `CODEBASE.yaml` changes require the lead/coordinator agent only

## After Every Code Change

1. Run: `{{validate-module-command}} capabilities/<module-name>/`
2. If MODULE.md is stale, update it:
   - Add/remove rows from the Files table
   - Update line counts
   - Update dependencies if imports changed
   - Add to Gotchas if you discovered a non-obvious behavior
3. If you modified types in `contract.ts`, run: `{{sync-types-command}}`

## Gotchas

{{project-specific landmines — things agents MUST know to avoid bugs}}
{{example: "d.list() returns lightweight objects — MUST use d.get(id) for full operations"}}
{{example: "Signed URLs expire in 1 hour — need refresh for long-lived sessions"}}
{{example: "Build command is `bun run build`, not `npm run build`"}}
```

---

## Companion: `CODEBASE.yaml` Template

Place at project root alongside `CLAUDE.md`:

```yaml
name: {{project-name}}
description: "{{one-line description}}"

modules:
  {{module-name}}:
    path: capabilities/{{module-name}}/
    purpose: "{{what this module does in one sentence}}"
    exports: [{{functionA}}, {{functionB}}]
    depends_on: [{{other-module-names}}]
    consumed_by: [{{route-or-module-names-that-use-this}}]

  # Repeat for each module...

shared:
  path: shared/
  purpose: "Infrastructure shared across all modules (DB, auth, logging)"
  files: [database-connection.ts, auth-middleware.ts, logging.ts]
  note: "Changes here trigger ALL module tests"

routes:
  - path: routes/{{route-name}}/
    method: {{GET|POST|PUT|DELETE}}
    auth: {{required|optional|none}}
    # Add streams: true for SSE endpoints
```

---

## Companion: `MODULE.md` Template

Place one in every `capabilities/<name>/` directory:

```markdown
# {{module-name}}

## Purpose
{{What this module does in 1-2 sentences.}}

## Files
| File | Function | Lines |
|------|----------|-------|
| {{file}}.ts | {{functionName}}({{params}}) -> {{return}} | {{n}} |
| contract.ts | {{TypeA}}, {{TypeB}} types | {{n}} |

## Dependencies
- `{{package}}` (external) — {{what you use from it}}
- `{{other-module}}/contract.ts` — {{TypeName}} type

## Error Modes
- {{ErrorClassName}}: {{when this happens}}

## Gotchas
- {{Non-obvious behavior that will cause bugs if unknown}}

## Quick Verification
  {{test-command}} capabilities/{{module-name}}/

## Recent Changes
- {{YYYY-MM-DD}}: {{what changed and why}}
```

---

## Setup Checklist

When applying this template to an existing project:

1. [ ] Copy the CLAUDE.md template, fill in all `{{placeholders}}`
2. [ ] Create `CODEBASE.yaml` at project root
3. [ ] Create `capabilities/` directory structure
4. [ ] Move code into capability modules (one function per file)
5. [ ] Create `contract.ts` at each module boundary
6. [ ] Create `MODULE.md` in each capability directory
7. [ ] Move tests to co-locate with implementation
8. [ ] Create `shared/golden-types/` for canonical type definitions
9. [ ] Add `@synced-from` annotations to copied types in `contract.ts`
10. [ ] Create `scripts/sync-golden-types.ts`
11. [ ] Create `scripts/validate-module.ts`
12. [ ] Add pre-commit hook for structure validation
13. [ ] Add CI step for import boundary + type sync checks
