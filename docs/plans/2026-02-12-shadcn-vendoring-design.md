# shadcn Component Vendoring Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the LLM select shadcn/ui components during planning, then deterministically copy real shadcn source files into the generated app — no shadcn CLI, no `components.json`, no fingerprint.

**Architecture:** A flat `shadcn-registry/` directory holds ~20 curated component `.tsx` files plus a `_deps.json` manifest mapping each to its npm dependencies. ChatPlan gains a `shadcnComponents: string[]` field. The template pipeline copies selected components into the sandbox and merges their deps into `package.json`.

## Component Registry

```
platform/shadcn-registry/
  _deps.json            # component → { deps, requires }
  accordion.tsx
  alert.tsx
  avatar.tsx
  badge.tsx
  button.tsx            # base (always included)
  card.tsx              # base (always included)
  checkbox.tsx
  dialog.tsx
  dropdown-menu.tsx
  input.tsx             # base (always included)
  label.tsx             # base (always included)
  popover.tsx
  progress.tsx
  radio-group.tsx
  scroll-area.tsx
  select.tsx
  separator.tsx
  switch.tsx
  table.tsx
  tabs.tsx
  textarea.tsx
  tooltip.tsx
```

### Source preparation rules
- Copy from latest shadcn/ui registry source (React 19 function component style)
- Remove `"use client"` directive (Vite SPA, not Next.js)
- Keep `data-slot` attributes (good practice, no shadcn fingerprint)
- Imports use `@/lib/utils` for `cn()` and `@/components/ui/*` for inter-component deps
- All other code stays verbatim

### _deps.json format

```json
{
  "_base": ["button", "card", "input", "label"],
  "dialog": { "deps": { "radix-ui": "^1.1.0" }, "requires": ["button"] },
  "table": { "deps": {} },
  "tabs": { "deps": { "radix-ui": "^1.1.0" } },
  "select": { "deps": { "radix-ui": "^1.1.0" } },
  "badge": { "deps": {} },
  "avatar": { "deps": { "radix-ui": "^1.1.0" } },
  "scroll-area": { "deps": { "radix-ui": "^1.1.0" } },
  "dropdown-menu": { "deps": { "radix-ui": "^1.1.0" } },
  "tooltip": { "deps": { "radix-ui": "^1.1.0" } },
  "popover": { "deps": { "radix-ui": "^1.1.0" } },
  "checkbox": { "deps": { "radix-ui": "^1.1.0" } },
  "radio-group": { "deps": { "radix-ui": "^1.1.0" } },
  "switch": { "deps": { "radix-ui": "^1.1.0" } },
  "accordion": { "deps": { "radix-ui": "^1.1.0" } },
  "separator": { "deps": { "radix-ui": "^1.1.0" } },
  "progress": { "deps": { "radix-ui": "^1.1.0" } },
  "alert": { "deps": {} },
  "textarea": { "deps": {} }
}
```

## ChatPlan Change

```typescript
interface ChatPlan {
  appName: string;
  appDescription: string;
  features: FeatureSpec[];
  designTokens: DesignTokens;
  shadcnComponents: string[];  // NEW — e.g. ["dialog", "table", "tabs"]
}
```

Base components (button, card, input, label) are always included — the LLM doesn't need to list them.

## System Prompt Addition

Add to builder system prompt Phase 2 instructions:

```
4. **UI Components**
   - Select which shadcn/ui components the app needs from this list:
     accordion, alert, avatar, badge, checkbox, dialog, dropdown-menu,
     popover, progress, radio-group, scroll-area, select, separator,
     switch, table, tabs, textarea, tooltip
   - Base components (button, card, input, label) are always included
   - Only pick components the app actually uses — don't over-select
```

## Pipeline Integration

After scaffold templates execute (layer 0), before writing layer 1 files:

```typescript
// lib/shadcn-installer.ts
export function installShadcnComponents(
  selected: string[]
): { files: GeneratedFile[], deps: Record<string, string> }
```

1. Read `_deps.json` manifest
2. Start with `_base` components (always included)
3. Add user-selected components
4. Resolve transitive `requires` (dialog → button already in base, but ensures coverage)
5. Deduplicate
6. Read each `.tsx` file from `shadcn-registry/`
7. Return as `GeneratedFile[]` with `path: src/components/ui/<name>.tsx`, `layer: 0`
8. Collect all npm deps into merged object

Called from `template-pipeline.ts` after layer 0 templates, before layer 1.

## Scaffold Template Changes

- Remove the 4 `.hbs` component files from `templates/scaffold/src/components/ui/`
- Base components now come from `shadcn-registry/` via the installer
- `package.json.hbs` keeps `class-variance-authority` (used by button)

## What Changes

| File | Change |
|------|--------|
| `lib/types.ts` | Add `shadcnComponents: string[]` to `ChatPlan` |
| `lib/schemas.ts` | Add field to `ChatPlanSchema` |
| `lib/system-prompt.ts` | Add component selection instructions |
| `lib/chat-tools.ts` | Update `show_plan` schema |
| `lib/shadcn-installer.ts` | NEW — reads registry, returns files + deps |
| `lib/template-pipeline.ts` | Call `installShadcnComponents()` after layer 0 |
| `shadcn-registry/` | NEW — ~20 component files + `_deps.json` |
| `templates/scaffold/src/components/ui/*.hbs` | DELETE — replaced by registry |
| `components/builder-chat.tsx` | Show selected components in plan card |
| `lib/mock-data.ts` | Add `shadcnComponents` to mock ChatPlan |
