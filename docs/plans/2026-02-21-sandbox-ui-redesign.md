# Sandbox UI Redesign

**Date:** 2026-02-21
**Status:** Approved
**Scope:** `src/components/builder-preview.tsx`, `src/components/project-layout.tsx`

## Goal

Replace the hand-rolled tab bar and header in `BuilderPreview` with the `Sandbox` component primitives from `src/components/ai-elements/sandbox.tsx`. Drop the Database tab, Edit mode toggle, and related state/props. Add a status badge to the header that reflects whether the preview is building or ready.

## Design Decisions

- **Tabs kept:** Preview + Code only (Database tab removed)
- **Edit mode:** Removed (pencil icon, postMessage, element selection badge, `selectedElement` state)
- **Status badge:** Derived from `previewUrl` presence using existing `getStatusBadge` utility
- **No collapsible wrapper:** `Sandbox` (Collapsible) wrapping not used — full-panel layout preserved
- **VS Code iframe preserve-on-tab-switch:** `forceMount` + `data-[state=inactive]:hidden` on `SandboxTabContent`

## Files Changed

### `src/components/builder-preview.tsx`

**Props removed:**
- `sandboxId` — was never used in the component body
- `supabaseUrl` — only needed for Database tab (dropped)
- `supabaseProjectId` — only needed for Database tab (dropped)
- `onElementSelected` — only needed for Edit mode (dropped)

**Props kept:** `projectId`, `previewUrl`, `codeServerUrl`

**State removed:**
- `editMode` — Edit mode gone
- `selectedElement` — Edit mode gone
- `mountedTabs` (Set) — replaced by Radix `forceMount` pattern

**Imports removed:**
- `MousePointer`, `X` from lucide-react
- `DatabaseManager`
- `Badge`
- `ElementContext` type

**Imports added:**
- `SandboxTabs`, `SandboxTabsBar`, `SandboxTabsList`, `SandboxTabsTrigger`, `SandboxTabContent` from `@/components/ai-elements/sandbox`
- `getStatusBadge` from `@/components/ai-elements/tool`
- `ToolPart` type from `@/components/ai-elements/tool`

**New structure:**
```tsx
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
  <SandboxTabs defaultValue="preview" className="flex-1 flex flex-col gap-0">
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
```

### `src/components/project-layout.tsx`

- Remove `selectedElement` state
- Remove `onElementSelected` handler (`setSelectedElement`)
- Remove `supabaseUrl`, `supabaseProjectId`, `sandboxId`, `onElementSelected` from `<BuilderPreview>` JSX call
- Keep `onEditComplete` prop on `BuilderChat` only if it's still used there (otherwise remove)

## Status Badge Mapping

| Condition | `ToolPart['state']` | Badge label | Icon |
|-----------|---------------------|-------------|------|
| `previewUrl` undefined | `'input-available'` | Running | pulsing clock |
| `previewUrl` defined | `'output-available'` | Completed | green checkmark |

## Testing

- `bun run build` — verify TypeScript compiles clean
- `bun run lint` — verify OxLint 0 errors
- Manual: verify Preview tab shows iframe, Code tab shows VS Code, tab switch doesn't reload VS Code
- Manual: verify Deploy button calls `/api/projects/deploy`
- Manual: verify status badge shows "Running" before preview is ready, "Completed" after
