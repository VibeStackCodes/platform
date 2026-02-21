# Sandbox UI Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `BuilderPreview`'s hand-rolled tab bar and header with the `Sandbox` component primitives already installed in the project, dropping the Database tab, Edit mode, and dead props.

**Architecture:** Two files change. `builder-preview.tsx` loses ~60 lines of custom tab/edit-mode code and gains `SandboxTabs`/`SandboxTabsBar`/`SandboxTabsList`/`SandboxTabsTrigger`/`SandboxTabContent` + a `getStatusBadge` call. `project-layout.tsx` removes the four now-dead props from its `BuilderPreview` call.

**Tech Stack:** React 19, Radix Tabs (via shadcn), `src/components/ai-elements/sandbox.tsx` (already installed), `src/components/ai-elements/tool.tsx` (`getStatusBadge`), Tailwind v4.

---

### Task 1: Rewrite `BuilderPreview`

**Files:**
- Modify: `src/components/builder-preview.tsx`

All relevant source is already read. Replace the entire file.

**Step 1: Write the new file**

```tsx
'use client'

import { Rocket } from 'lucide-react'
import { useCallback } from 'react'
import {
  SandboxTabContent,
  SandboxTabs,
  SandboxTabsBar,
  SandboxTabsList,
  SandboxTabsTrigger,
} from '@/components/ai-elements/sandbox'
import { getStatusBadge } from '@/components/ai-elements/tool'
import { WebPreview, WebPreviewBody } from '@/components/ai-elements/web-preview'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/utils'

interface BuilderPreviewProps {
  projectId: string
  previewUrl?: string
  codeServerUrl?: string
}

export function BuilderPreview({ projectId, previewUrl, codeServerUrl }: BuilderPreviewProps) {
  const handleDeploy = useCallback(async () => {
    try {
      const response = await apiFetch('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) throw new Error('Deployment failed')
      const data = await response.json()
      console.log('Deployed:', data)
    } catch (error) {
      console.error('Deployment error:', error)
    }
  }, [projectId])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Preview</span>
          {getStatusBadge(previewUrl ? 'output-available' : 'input-available')}
        </div>
        <Button size="sm" onClick={handleDeploy}>
          <Rocket className="mr-2 size-4" />
          Deploy
        </Button>
      </div>

      {/* Tabs */}
      <SandboxTabs defaultValue="preview" className="flex flex-1 flex-col gap-0">
        <SandboxTabsBar>
          <SandboxTabsList>
            <SandboxTabsTrigger value="preview">Preview</SandboxTabsTrigger>
            <SandboxTabsTrigger value="code">Code</SandboxTabsTrigger>
          </SandboxTabsList>
        </SandboxTabsBar>

        <SandboxTabContent value="preview" className="flex-1">
          {previewUrl ? (
            <WebPreview key={previewUrl} defaultUrl={previewUrl} className="h-full">
              <WebPreviewBody src={previewUrl} className="h-full" />
            </WebPreview>
          ) : (
            <div className="h-full" />
          )}
        </SandboxTabContent>

        {/* forceMount keeps VS Code server alive across tab switches */}
        <SandboxTabContent
          value="code"
          forceMount
          className="data-[state=inactive]:hidden flex-1"
        >
          {codeServerUrl ? (
            <iframe
              src={codeServerUrl}
              className="h-full w-full border-0"
              title="Code Editor"
              allow="clipboard-read; clipboard-write; cross-origin-isolated"
              // oxlint-disable-next-line eslint-plugin-react(iframe-missing-sandbox)
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          ) : (
            <div className="h-full" />
          )}
        </SandboxTabContent>
      </SandboxTabs>
    </div>
  )
}
```

**Step 2: Typecheck**

```bash
cd /Users/ammishra/VibeStack/platform/.claude/worktrees/twinkly-sprouting-llama
bunx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Expected: errors only about `project-layout.tsx` passing removed props (fixed in Task 2). Zero errors in `builder-preview.tsx` itself.

**Step 3: Commit**

```bash
git add src/components/builder-preview.tsx
git commit -m "feat: replace builder preview UI with Sandbox component primitives"
```

---

### Task 2: Clean up `ProjectLayout` call-site

**Files:**
- Modify: `src/components/project-layout.tsx`

**Step 1: Remove dead state and props from `ProjectLayout`**

In `project-layout.tsx`, make these changes:

1. Remove the `selectedElement` state declaration (line 89):
   ```tsx
   // DELETE this line:
   const [selectedElement, setSelectedElement] = useState<ElementContext | null>(null)
   ```

2. Remove the `ElementContext` import from `@/lib/types` (line 9) if it's no longer used anywhere else in the file.

3. In the `<BuilderPreview>` JSX (lines 179-188), replace the current call with:
   ```tsx
   <BuilderPreview
     projectId={projectId}
     previewUrl={previewUrl}
     codeServerUrl={codeServerUrl}
   />
   ```
   (Remove `sandboxId`, `supabaseUrl`, `supabaseProjectId`, `onElementSelected`.)

4. In `<BuilderChat>`, remove the `selectedElement` and `onEditComplete` props IF `BuilderChat` accepts/uses them for the visual editing flow. Check if `BuilderChat` still needs `onEditComplete` — if neither prop is used in `BuilderChat` for any remaining feature, remove them. If `BuilderChat` still has other logic for those props, leave them and just remove the `setSelectedElement` callback passed as the value.

   To be safe, check `builder-chat.tsx` first — if `selectedElement` and `onEditComplete` are used there for edit-panel display, leave the props on `BuilderChat` but pass `null`/no-op. If they're purely plumbing for the now-removed visual edit feature, remove them outright.

**Step 2: Typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Expected: 0 errors.

**Step 3: Lint**

```bash
bun run lint 2>&1 | head -40
```

Expected: 0 errors. Pay attention to `no-unused-vars` — remove any now-unused imports (`ElementContext`, `MousePointer`, etc.) that lint flags.

**Step 4: Commit**

```bash
git add src/components/project-layout.tsx
git commit -m "chore: remove dead props and state from ProjectLayout after sandbox UI redesign"
```

---

### Task 3: Verify `SandboxTabContent` height fills correctly

The `SandboxTabContent` wrapper is a Radix `TabsContent` div. It gets `mt-0 text-sm` by default (from `sandbox.tsx`). Adding `flex-1` makes it grow to fill the `SandboxTabs` flex container — but only if `SandboxTabs` itself is `flex flex-col`.

**Step 1: Check `SandboxTabs` className**

In `src/components/ai-elements/sandbox.tsx` line 56-58:
```tsx
export const SandboxTabs = ({ className, ...props }: SandboxTabsProps) => (
  <Tabs className={cn('w-full gap-0', className)} {...props} />
)
```

The plan passes `className="flex flex-1 flex-col gap-0"` which merges with the base `w-full gap-0`. Tailwind v4 — confirm `flex flex-col flex-1` is applied correctly on the merged class list.

**Step 2: Manual visual check**

Run dev server and navigate to a project page:
```bash
bun run dev
```

Open `http://localhost:5173/project/<any-project-id>` (or use mock mode: `VITE_MOCK_MODE=true bun run dev`).

Verify:
- [ ] Header shows "Preview" label + "Running" badge (pulsing clock icon) before sandbox is ready
- [ ] Header shows "Preview" label + "Completed" badge (green checkmark) once `previewUrl` is set
- [ ] Preview tab fills full height with the iframe
- [ ] Code tab fills full height with VS Code iframe
- [ ] Switching from Code → Preview → Code does NOT reload the VS Code server (URL bar should not flicker)
- [ ] Deploy button still calls `/api/projects/deploy` (check Network tab in DevTools)
- [ ] Tab underline indicator moves correctly between Preview and Code

**Step 3: Build check**

```bash
bun run build 2>&1 | tail -20
```

Expected: no TypeScript or Vite errors.

**Step 4: Final commit if any CSS fixups were needed**

```bash
git add -p
git commit -m "fix: adjust tab content height classes for full-panel layout"
```

---

## Key Reference Files

- `src/components/ai-elements/sandbox.tsx` — `SandboxTabs`, `SandboxTabsBar`, `SandboxTabsList`, `SandboxTabsTrigger`, `SandboxTabContent`
- `src/components/ai-elements/tool.tsx` — `getStatusBadge`, `ToolPart` type
- `src/components/ai-elements/web-preview.tsx` — `WebPreview`, `WebPreviewBody`
- `src/components/builder-chat.tsx` — check `selectedElement` / `onEditComplete` prop usage before removing

## Notes

- `SandboxTabContent` with `forceMount` renders as `data-[state=inactive]` when not active. The `hidden` utility hides it visually without unmounting the iframe.
- The `getStatusBadge` function in `tool.tsx` returns a `<Badge>` — it's safe to call with `'input-available'` or `'output-available'` directly.
- `SandboxTabs` is built on Radix `Tabs` — `defaultValue="preview"` ensures Preview is active on mount.
- No new dependencies — everything is already in the project.
