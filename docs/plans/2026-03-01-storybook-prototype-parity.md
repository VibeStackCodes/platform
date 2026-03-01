# Storybook–Prototype Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all Storybook stories match the agentic-flow prototype at `platform-dusky-tau.vercel.app/prototypes/agentic-flow.html`.

**Architecture:** All new stories go under `VibeStack/` title prefix. ai-elements are pure presentational — no mocking needed. ChatColumn needs a structural stand-in (same pattern as AppSidebar/LandingNavbar) that composes the ai-elements in a realistic timeline. RightPanel needs stand-in stories for panel types not yet in the component (Progress, Design System, Preview+Tabs).

**Tech Stack:** Storybook 10 CSF3, React 19, shadcn/ui, existing ai-elements components

---

### Task 1: ChatColumn — Populated Timeline Story

The most impactful fix. Currently only shows EmptyState. Needs a structural stand-in that renders the full agentic flow conversation matching prototype steps 1–8.

**Files:**
- Create: `src/components/chat-column.fixtures.ts`
- Modify: `src/components/chat-column.stories.tsx`

**What the stand-in renders (matching prototype):**
1. User message bubble (right-aligned)
2. AgentHeader (Analyst Agent, 8.3s) with PlanBlock child (Project Plan — TaskFlow, 6 items)
3. HitlActions (Approve / Request Changes)
4. User "Approved" bubble
5. AgentHeader (Product Manager, 15.4s) with tool activity steps + ArtifactCard (PRD, lg size with Download)
6. HitlActions (approved state)
7. AgentHeader (Designer, 9.8s) with ArtifactCard (Design System)
8. AgentHeader (Architect, 7.2s) with tool activity description
9. AgentHeader (Frontend Agent, 18.3s) with tool steps showing file badges + line counts
10. ScriptBlock (bun run build → Done)
11. Final assistant message "TaskFlow is ready!"
12. PromptBar at bottom with model selector

**Stories:** `PopulatedTimeline`, `AgentWorking` (mid-generation state with working agent)

### Task 2: RightPanel — Missing Panel Types

Add 3 structural stand-in stories for panel modes shown in prototype but not in the component.

**Files:**
- Modify: `src/components/right-panel.stories.tsx`

**New stories (as render functions, not extending PanelContent):**

1. **ProgressPanel** — matches prototype step 6-7: numbered task list with status icons (done/in-progress/pending) + Artifacts section below. Uses a `StaticProgressPanel` render function.

2. **DesignSystemPanel** — matches prototype step 5: Light/Dark toggle, color swatches grid (Primary Indigo + Neutral Warm), semantic color cards (Success/Warning/Error/Info), typography scale (Display/Heading/Body). Uses a `StaticDesignSystemPanel` render function.

3. **PreviewWithTabs** — matches prototype step 8: Preview/Code toggle tabs (eye + </> icons), project title "TaskFlow" with "React" badge, Deploy button (accent pill), auto-save indicator, close button. Uses a `StaticPreviewPanel` render function.

### Task 3: PromptBar — Model Selector Visibility

The component already has ModelSelector built in. Current stories likely render it. Verify and add a story that explicitly demonstrates model switching.

**Files:**
- Modify: `src/components/prompt-bar.stories.tsx`

**New stories:** `WithModelSelector` (default state showing the model dropdown is visible)

### Task 4: BuilderPage — Richer Composed Story

Update BuilderPageShell to show a more realistic composed state matching the prototype.

**Files:**
- Modify: `src/components/builder-page.stories.tsx`

**New story:** `FullBuilderView` — left column shows a static chat placeholder with agent activity indicators, right panel shows the PreviewWithTabs stand-in.

### Task 5: Verify & Commit

- `bunx tsc --noEmit`
- `bun run lint`
- `bun run storybook:build` (ensures all stories compile)
- Commit all changes
