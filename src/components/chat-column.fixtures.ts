import type { PlanItem } from '@/components/ai-elements/plan-block'
import type { ToolStep } from '@/hooks/use-agent-stream'

/**
 * TaskFlow project plan — 6 items matching the agentic-flow prototype.
 */
export const taskflowPlan: PlanItem[] = [
  {
    title: 'Auth & User Management',
    description:
      'JWT-based authentication with role-based access control, team invitations, and profile management.',
  },
  {
    title: 'Kanban Board Engine',
    description:
      'Drag-and-drop board with customisable columns, card prioritisation, and WIP limits.',
  },
  {
    title: 'Task System',
    description:
      'Rich task cards with assignees, due dates, labels, checklists, attachments, and activity feed.',
  },
  {
    title: 'Real-time Collaboration',
    description:
      'WebSocket presence indicators, live cursor positions, and instant board updates for all team members.',
  },
  {
    title: 'Notifications',
    description:
      'In-app notification centre and optional email digests for assignments, mentions, and deadline reminders.',
  },
  {
    title: 'Responsive UI',
    description:
      'Mobile-first layout with full dark mode support, keyboard navigation, and WCAG 2.1 AA compliance.',
  },
]

// ── Tool step fixtures ───────────────────────────────────────────────
// Fake ToolStep data matching the prototype's agent tool activities.

let stepId = 0
function makeStep(tool: string, label: string, opts: Partial<ToolStep> = {}): ToolStep {
  stepId += 1
  return {
    id: `step-${stepId}`,
    tool,
    label,
    status: 'complete',
    startedAt: Date.now(),
    durationMs: 800 + Math.round(Math.random() * 2000),
    ...opts,
  }
}

export const strategyPlaybookSteps: ToolStep[] = [
  makeStep('readFile', 'Analyze market positioning and user personas'),
  makeStep('writeFile', 'Generate strategy document', { filePath: 'strategy.docx' }),
  makeStep('readFile', 'Presented file'),
]

export const prdSteps: ToolStep[] = [
  makeStep('readFile', 'Analyze strategy playbook for requirements extraction'),
  makeStep('writeFile', 'Define user stories with acceptance criteria'),
  makeStep('writeFile', 'Generate PRD document', { filePath: 'prd.docx' }),
  makeStep('readFile', 'Presented file'),
]

export const designSystemSteps: ToolStep[] = [
  makeStep('readFile', 'Analyze PRD for visual requirements'),
  makeStep('writeFile', 'Generate color palette and typography scale'),
  makeStep('writeFile', 'Compile design tokens', { filePath: 'tokens.json' }),
  makeStep('readFile', 'Presented file'),
]

export const architectSteps: ToolStep[] = [
  makeStep('readFile', 'Decompose PRD into implementation tasks'),
  makeStep('writeFile', 'Map task dependencies and assign agents'),
  makeStep('runCommand', 'Assemble development team'),
]

export const infraSteps: ToolStep[] = [
  makeStep('createSandbox', 'Create sandbox environment'),
  makeStep('installPackage', 'Install dependencies'),
]

export const backendSchemaSteps: ToolStep[] = [
  makeStep('writeFile', 'Create database schema with tables', {
    filePath: 'src/db/schema.ts',
    newContent: '/* +48 lines */',
  }),
  makeStep('writeFile', 'Create database migration file', {
    filePath: 'src/db/001_init.sql',
    newContent: '/* +32 lines */',
  }),
  makeStep('runCommand', 'Run database migration'),
]

export const backendApiSteps: ToolStep[] = [
  makeStep('writeFile', 'Create auth middleware and routes', {
    filePath: 'src/routes/auth.ts',
    newContent: '/* +67 lines */',
  }),
  makeStep('writeFile', 'Build task CRUD API endpoints', {
    filePath: 'src/routes/tasks.ts',
    oldContent: '/* 2 lines */',
    newContent: '/* +94 lines */',
  }),
  makeStep('runBuild', 'Run build to verify compilation'),
]

export const frontendSteps: ToolStep[] = [
  makeStep('writeFile', 'Create KanbanBoard component', {
    filePath: 'src/components/KanbanBoard.tsx',
    newContent: Array(142).fill('//').join('\n'),
  }),
  makeStep('writeFile', 'Build TaskCard with drag-and-drop', {
    filePath: 'src/components/TaskCard.tsx',
    newContent: Array(86).fill('//').join('\n'),
  }),
  makeStep('writeFile', 'Create navigation layout and sidebar', {
    filePath: 'src/components/Layout.tsx',
    newContent: Array(58).fill('//').join('\n'),
  }),
  makeStep('runBuild', 'Run build — all checks passed'),
]

export const finalBuildSteps: ToolStep[] = [
  makeStep('runBuild', 'Run full build verification'),
  makeStep('runCommand', 'Deploy to preview URL'),
]

/** Working-state steps (PM mid-generation) */
export const prdWorkingSteps: ToolStep[] = [
  makeStep('readFile', 'Analyze strategy playbook for requirements extraction'),
  {
    id: 'step-working',
    tool: 'writeFile',
    label: 'Define user stories with acceptance criteria',
    status: 'running',
    startedAt: Date.now(),
  },
]
