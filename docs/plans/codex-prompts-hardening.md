# Hardening Prompt — Fix Lint Errors + Type Alignment + Defensive Guards

One prompt, 4 focused tasks. No new features — just fix what's broken or fragile.

---

```
You are working in the VibeStack platform codebase. Fix all lint errors (currently 10), add defensive guards for capability selection, and ensure the capability assembler's output is consumed correctly by downstream code.

Run `bun run lint` to see all current errors before starting. Run `bunx tsc --noEmit && bun run test && bun run lint` after EACH fix to ensure nothing regresses.

## Task A: Fix all 10 lint errors to zero

Run `bun run lint 2>&1 | grep "x eslint"` to see them. As of now they are:

1. `server/lib/theme-routes/canape.ts:27` — Function `escapeJsx` declared but never used
2. `server/lib/theme-routes/canape.ts:36` — Function `imageryFallback` declared but never used
3. `server/lib/agents/edit-machine.ts:133` — Variable `analystAgent` declared but never used
4-10. `server/lib/theme-routes/canape.ts` lines 303, 391, 451, 540, 628, 686, 863, 996 — Parameter `context` declared but never used (8 instances)

Fixes:
- For unused functions `escapeJsx` and `imageryFallback`: check if they're used elsewhere in the file. If truly unused, delete them. If they're exported and used by other files, keep them.
- For unused `analystAgent` import: check what it's used for. If the import is needed for side effects or type inference, prefix with `_`. If truly unused, remove the import.
- For unused `context` parameters: prefix with `_context`. These are function signature parameters that must exist for positional reasons but aren't used in the function body.

After fixing, `bun run lint 2>&1 | grep "x eslint"` should return nothing. Warnings are acceptable (don't fix warnings).

## Task B: Guard capability selection in orchestrator

Read `server/lib/agents/orchestrator.ts`, specifically the `runAnalysisHandler` function.

The LLM may return invalid capability names in `selectedCapabilities` (e.g., "cooking" instead of "recipes"). Add a defensive filter:

```typescript
// After line ~120 where selectedCapabilities is extracted:
const selectedCapabilities = Array.isArray(part.input.selectedCapabilities)
  ? part.input.selectedCapabilities
  : []

// ADD THIS: Filter to only valid registered capability names
const registry = loadCoreRegistry()
const validNames = new Set(registry.list().map(c => c.name))
const validatedCapabilities = selectedCapabilities.filter(
  (name: string) => validNames.has(name)
)
if (validatedCapabilities.length !== selectedCapabilities.length) {
  console.warn(
    '[analysis] Analyst selected unknown capabilities:',
    selectedCapabilities.filter((name: string) => !validNames.has(name)),
  )
}
```

Then use `validatedCapabilities` instead of `selectedCapabilities` for the rest of the function (the `if (selectedCapabilities.length > 0)` block etc).

Do the same in `server/lib/agents/edit-machine.ts` — find the `analyzing` state's `onDone` guard where it reads `event.output.capabilityManifest`. Filter through the same valid names check.

## Task C: Ensure 'public-website' is always included

In the orchestrator's analysis handler (same function as Task B), after validating capability names, ensure `public-website` is always in the list if any capabilities were selected:

```typescript
if (validatedCapabilities.length > 0 && !validatedCapabilities.includes('public-website')) {
  validatedCapabilities.unshift('public-website')
}
```

This prevents the analyst from forgetting the base layout capability.

## Task D: Add test coverage for defensive guards

Create or update `tests/capability-selection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { loadCoreRegistry } from '@server/capabilities/catalog'

describe('Capability selection guards', () => {
  it('filters out invalid capability names', () => {
    const registry = loadCoreRegistry()
    const validNames = new Set(registry.list().map(c => c.name))

    const selected = ['auth', 'recipes', 'cooking', 'food-delivery']
    const validated = selected.filter(name => validNames.has(name))

    expect(validated).toEqual(['auth', 'recipes'])
    expect(validated).not.toContain('cooking')
    expect(validated).not.toContain('food-delivery')
  })

  it('always includes public-website when capabilities are selected', () => {
    const selected = ['auth', 'blog']
    const withBase = selected.includes('public-website')
      ? selected
      : ['public-website', ...selected]

    expect(withBase[0]).toBe('public-website')
    expect(withBase).toContain('auth')
    expect(withBase).toContain('blog')
  })

  it('does not add public-website when no capabilities selected', () => {
    const selected: string[] = []
    const withBase = selected.length > 0 && !selected.includes('public-website')
      ? ['public-website', ...selected]
      : selected

    expect(withBase).toEqual([])
  })

  it('does not duplicate public-website if already present', () => {
    const selected = ['public-website', 'auth', 'blog']
    const withBase = selected.includes('public-website')
      ? selected
      : ['public-website', ...selected]

    expect(withBase.filter(n => n === 'public-website')).toHaveLength(1)
  })

  it('all registered capabilities have name and description', () => {
    const registry = loadCoreRegistry()
    const caps = registry.list()

    expect(caps.length).toBeGreaterThanOrEqual(5)
    for (const cap of caps) {
      expect(cap.name).toBeTruthy()
      expect(cap.description).toBeTruthy()
      expect(cap.schema.length).toBeGreaterThanOrEqual(0)
      expect(cap.pages.length).toBeGreaterThanOrEqual(0)
    }
  })
})
```

## Verification

After ALL tasks:

```bash
bunx tsc --noEmit          # Clean compile
bun run test               # All pass
bun run lint 2>&1 | grep "x eslint"  # Should return NOTHING (0 errors)
```

IMPORTANT: Do not "fix" warnings. Only fix errors (lines with `x eslint`). Warnings are acceptable.
```
