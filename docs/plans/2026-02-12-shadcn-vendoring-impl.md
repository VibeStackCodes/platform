# shadcn Component Vendoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `shadcn-registry/` of ~20 curated component source files that the template pipeline copies into generated apps based on LLM selection during ChatPlan.

**Architecture:** Flat directory of `.tsx` files + `_deps.json` manifest. ChatPlan gains `shadcnComponents: string[]`. A new `shadcn-installer.ts` module reads the registry and returns `GeneratedFile[]` + npm deps. Called from `template-pipeline.ts` after layer 0.

**Tech Stack:** TypeScript, Zod, React 19 (function components, no forwardRef), radix-ui (unified package), class-variance-authority

---

### Task 1: Add `shadcnComponents` to types and schemas

**Files:**
- Modify: `platform/lib/types.ts:87-92`
- Modify: `platform/lib/schemas.ts:72-77`

**Step 1: Update ChatPlan type**

In `platform/lib/types.ts`, add `shadcnComponents` to the `ChatPlan` interface:

```typescript
export interface ChatPlan {
  appName: string;
  appDescription: string;
  features: FeatureSpec[];
  designTokens: DesignTokens;
  shadcnComponents: string[];
}
```

**Step 2: Update ChatPlanSchema**

In `platform/lib/schemas.ts`, add the field to `ChatPlanSchema`:

```typescript
export const SHADCN_COMPONENT_NAMES = [
  'accordion', 'alert', 'avatar', 'badge', 'checkbox', 'dialog',
  'dropdown-menu', 'popover', 'progress', 'radio-group', 'scroll-area',
  'select', 'separator', 'switch', 'table', 'tabs', 'textarea', 'tooltip',
] as const;

export const ChatPlanSchema = z.object({
  appName: z.string().describe('Short app name, 2-4 words'),
  appDescription: z.string().describe('2-3 sentence summary'),
  features: z.array(FeatureSpecSchema).describe('5-10 structured features'),
  designTokens: DesignTokensSchema,
  shadcnComponents: z.array(z.string()).describe('UI components needed: ' + SHADCN_COMPONENT_NAMES.join(', ')),
});
```

**Step 3: Verify**

Run: `cd platform && pnpm tsc --noEmit 2>&1 | head -20`
Expected: Clean (or only pre-existing errors)

**Step 4: Commit**

```bash
git add platform/lib/types.ts platform/lib/schemas.ts
git commit -m "feat: add shadcnComponents to ChatPlan type and schema"
```

---

### Task 2: Update chat-tools, system prompt, and mock data

**Files:**
- Modify: `platform/lib/chat-tools.ts:37-42`
- Modify: `platform/lib/system-prompt.ts:43-50`
- Modify: `platform/lib/mock-data.ts:59-60`

**Step 1: Add shadcnComponents to show_plan tool schema**

In `platform/lib/chat-tools.ts`, update the `show_plan` inputSchema (after line 41, the `designTokens` field):

```typescript
    inputSchema: z.object({
      appName: z.string().describe('Short name for the app (2-4 words)'),
      appDescription: z.string().describe('2-3 sentence description of the app'),
      features: z.array(FeatureSpecSchema).describe('5-10 structured features with categories and entities'),
      designTokens: DesignTokensSchema.describe('Visual design tokens'),
      shadcnComponents: z.array(z.string()).describe('UI components needed from: accordion, alert, avatar, badge, checkbox, dialog, dropdown-menu, popover, progress, radio-group, scroll-area, select, separator, switch, table, tabs, textarea, tooltip'),
    }),
```

**Step 2: Add component selection instructions to system prompt**

In `platform/lib/system-prompt.ts`, after the "Design Tokens" section (after line 49, before `### Phase 3`), add:

```
4. **UI Components**
   - Select which shadcn/ui components the app needs from this list:
     accordion, alert, avatar, badge, checkbox, dialog, dropdown-menu,
     popover, progress, radio-group, scroll-area, select, separator,
     switch, table, tabs, textarea, tooltip
   - Base components (button, card, input, label) are always included — do NOT list them
   - Only pick components the app actually uses — don't over-select
   - Example: a dashboard app might need ["table", "tabs", "badge", "select", "avatar"]
```

**Step 3: Add shadcnComponents to mock data**

In `platform/lib/mock-data.ts`, add before the closing `};` of `MOCK_CHAT_PLAN` (before line 60):

```typescript
  shadcnComponents: ['dialog', 'badge', 'avatar', 'tabs', 'select', 'textarea'],
```

**Step 4: Verify**

Run: `cd platform && pnpm tsc --noEmit 2>&1 | head -20`

**Step 5: Commit**

```bash
git add platform/lib/chat-tools.ts platform/lib/system-prompt.ts platform/lib/mock-data.ts
git commit -m "feat: add shadcnComponents to chat tools, prompt, and mock data"
```

---

### Task 3: Create `_deps.json` manifest

**Files:**
- Create: `platform/shadcn-registry/_deps.json`

**Step 1: Create the manifest**

Create `platform/shadcn-registry/_deps.json`:

```json
{
  "_base": ["button", "card", "input", "label"],
  "accordion": { "deps": { "radix-ui": "^1.1.0" } },
  "alert": { "deps": {} },
  "avatar": { "deps": { "radix-ui": "^1.1.0" } },
  "badge": { "deps": {} },
  "button": { "deps": { "class-variance-authority": "^0.7.1" } },
  "card": { "deps": {} },
  "checkbox": { "deps": { "radix-ui": "^1.1.0" } },
  "dialog": { "deps": { "radix-ui": "^1.1.0" }, "requires": ["button"] },
  "dropdown-menu": { "deps": { "radix-ui": "^1.1.0" } },
  "input": { "deps": {} },
  "label": { "deps": { "radix-ui": "^1.1.0" } },
  "popover": { "deps": { "radix-ui": "^1.1.0" } },
  "progress": { "deps": { "radix-ui": "^1.1.0" } },
  "radio-group": { "deps": { "radix-ui": "^1.1.0" } },
  "scroll-area": { "deps": { "radix-ui": "^1.1.0" } },
  "select": { "deps": { "radix-ui": "^1.1.0" } },
  "separator": { "deps": { "radix-ui": "^1.1.0" } },
  "switch": { "deps": { "radix-ui": "^1.1.0" } },
  "table": { "deps": {} },
  "tabs": { "deps": { "radix-ui": "^1.1.0", "class-variance-authority": "^0.7.1" } },
  "textarea": { "deps": {} },
  "tooltip": { "deps": { "radix-ui": "^1.1.0" } }
}
```

**Step 2: Commit**

```bash
git add platform/shadcn-registry/_deps.json
git commit -m "feat: add shadcn registry deps manifest"
```

---

### Task 4: Copy and prepare component source files

**Files:**
- Create: `platform/shadcn-registry/*.tsx` (~22 files)
- Delete: `platform/templates/scaffold/src/components/ui/*.hbs` (4 files)

**Step 1: Copy components from platform's own UI**

For each component in the registry, copy from `platform/components/ui/<name>.tsx` to `platform/shadcn-registry/<name>.tsx`. Apply these transformations:
- Remove `"use client"` line (first line if present)
- Keep everything else verbatim

The platform already has these components: accordion, alert, avatar, badge, button, card, checkbox (if exists), dialog, dropdown-menu, input, label, popover, progress, scroll-area, select, separator, switch, tabs, textarea, tooltip.

For components not in the platform (table, radio-group), create them from the latest shadcn/ui source with the same conventions:
- React 19 function components (no forwardRef)
- `data-slot` attributes
- Import from `"radix-ui"` (unified package)
- Import `cn` from `@/lib/utils`

**Step 2: Delete old scaffold .hbs component files**

Delete these files (now replaced by registry):
- `platform/templates/scaffold/src/components/ui/button.tsx.hbs`
- `platform/templates/scaffold/src/components/ui/card.tsx.hbs`
- `platform/templates/scaffold/src/components/ui/input.tsx.hbs`
- `platform/templates/scaffold/src/components/ui/label.tsx.hbs`

**Step 3: Verify file count**

Run: `ls platform/shadcn-registry/*.tsx | wc -l`
Expected: 22 (20 selectable + button + card which are base but also in registry)

Wait — button, card, input, label are all in the registry too (they're base, always included). So 22 total `.tsx` files.

**Step 4: Commit**

```bash
git add platform/shadcn-registry/
git rm platform/templates/scaffold/src/components/ui/button.tsx.hbs platform/templates/scaffold/src/components/ui/card.tsx.hbs platform/templates/scaffold/src/components/ui/input.tsx.hbs platform/templates/scaffold/src/components/ui/label.tsx.hbs
git commit -m "feat: add shadcn registry component sources, remove old .hbs UI components"
```

---

### Task 5: Create `shadcn-installer.ts`

**Files:**
- Create: `platform/lib/shadcn-installer.ts`

**Step 1: Write the installer module**

Create `platform/lib/shadcn-installer.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import type { GeneratedFile } from './types';

interface DepsManifest {
  _base: string[];
  [component: string]: { deps: Record<string, string>; requires?: string[] } | string[];
}

/**
 * Read shadcn component files from the registry and return them as GeneratedFile[].
 * Resolves transitive requires and always includes base components.
 */
export function installShadcnComponents(
  selected: string[]
): { files: GeneratedFile[]; deps: Record<string, string> } {
  const registryDir = join(process.cwd(), 'shadcn-registry');
  const manifest: DepsManifest = JSON.parse(
    readFileSync(join(registryDir, '_deps.json'), 'utf-8')
  );

  // Resolve full component set: base + selected + transitive requires
  const resolved = new Set<string>(manifest._base);
  const queue = [...selected];

  while (queue.length > 0) {
    const name = queue.pop()!;
    if (resolved.has(name)) continue;
    resolved.add(name);

    const entry = manifest[name];
    if (entry && !Array.isArray(entry) && entry.requires) {
      queue.push(...entry.requires);
    }
  }

  // Read files and collect deps
  const files: GeneratedFile[] = [];
  const deps: Record<string, string> = {};

  for (const name of resolved) {
    const filePath = join(registryDir, `${name}.tsx`);
    try {
      let content = readFileSync(filePath, 'utf-8');
      // Strip "use client" directive (not needed in Vite SPA)
      content = content.replace(/^"use client"\n\n?/, '');
      files.push({
        path: `src/components/ui/${name}.tsx`,
        content,
        layer: 0,
      });
    } catch {
      console.warn(`[shadcn] Component not found in registry: ${name}`);
      continue;
    }

    const entry = manifest[name];
    if (entry && !Array.isArray(entry) && entry.deps) {
      Object.assign(deps, entry.deps);
    }
  }

  console.log(`[shadcn] Resolved ${resolved.size} components (${selected.length} selected + ${manifest._base.length} base)`);
  return { files, deps };
}
```

**Step 2: Verify**

Run: `cd platform && pnpm tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add platform/lib/shadcn-installer.ts
git commit -m "feat: add shadcn-installer module"
```

---

### Task 6: Integrate into template-pipeline.ts

**Files:**
- Modify: `platform/lib/template-pipeline.ts:30-66`

**Step 1: Import and call shadcn installer**

In `platform/lib/template-pipeline.ts`, add the import at the top:

```typescript
import { installShadcnComponents } from './shadcn-installer';
```

After the layer 0 loop completes (after the `emit checkpoint complete` for layer 0, around line 65), add:

```typescript
  // 2.5. Install shadcn components (after scaffold, before feature layers)
  if (chatPlan.shadcnComponents && chatPlan.shadcnComponents.length > 0) {
    emit({ type: 'checkpoint', label: 'Installing UI components', status: 'active' });

    const shadcn = installShadcnComponents(chatPlan.shadcnComponents);
    allFiles.push(...shadcn.files);
    Object.assign(allDeps, shadcn.deps);

    emit({ type: 'checkpoint', label: `Installing UI components (${shadcn.files.length})`, status: 'complete' });
  }
```

**Step 2: Verify**

Run: `cd platform && pnpm tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add platform/lib/template-pipeline.ts
git commit -m "feat: integrate shadcn installer into template pipeline"
```

---

### Task 7: Update builder-chat plan card UI

**Files:**
- Modify: `platform/components/builder-chat.tsx:440-459`

**Step 1: Add component chips to plan card**

In `platform/components/builder-chat.tsx`, after the Features section closing `</div>` (line 440) and before the Design section (line 442), add:

```tsx
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
```

**Step 2: Verify**

Run: `cd platform && pnpm tsc --noEmit 2>&1 | head -20`

**Step 3: Commit**

```bash
git add platform/components/builder-chat.tsx
git commit -m "feat: show selected shadcn components in plan card"
```

---

### Task 8: Verify end-to-end

**Step 1: TypeScript check**

Run: `cd platform && pnpm tsc --noEmit 2>&1 | head -20`
Expected: Clean

**Step 2: Verify registry integrity**

Run: `ls platform/shadcn-registry/*.tsx | wc -l && cat platform/shadcn-registry/_deps.json | node -e "const j=require('fs').readFileSync('/dev/stdin','utf8'); const d=JSON.parse(j); const keys=Object.keys(d).filter(k=>k!=='_base'); console.log(keys.length + ' components in manifest')"`
Expected: 22 files, 22 components in manifest

**Step 3: Verify old .hbs components removed**

Run: `ls platform/templates/scaffold/src/components/ui/ 2>/dev/null || echo "Directory removed (expected)"`
Expected: Directory removed or empty

**Step 4: Final commit (if any remaining changes)**

```bash
git status
# If clean, done. If not, stage and commit remaining changes.
```
