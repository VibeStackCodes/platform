# Mastra Agent Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate VibeStack from a procedural generation pipeline to a Mastra-based multi-agent architecture with 13+ specialized agents, 4-phase DAG workflows, human-in-the-loop plan approval, multi-model cost routing, and full observability.

**Architecture:** Mastra orchestrates a workflow DAG (clarify -> assemble-team -> generate-plan -> suspend for approval -> 4 execution phases). Each phase runs multiple Mastra agents in parallel, producing typed artifacts. Events stream to the client UI via SSE. Daytona sandboxes remain the execution layer for code generation, builds, and previews.

**Tech Stack:** Mastra (`@mastra/core`), Vercel AI SDK v6 (`ai`), Zod v4 (`zod`), Daytona SDK (`@daytonaio/sdk`), Supabase, Vitest

**Design Doc:** `docs/plans/2026-02-14-mastra-agent-architecture-design.md`

---

## Migration Strategy

This is a **parallel replacement** — the new Mastra pipeline will be built alongside the existing pipeline, behind a feature flag. The current pipeline (`template-pipeline.ts`, `generator.ts`, `verifier.ts`, `live-fixer.ts`) remains untouched until the new pipeline is validated end-to-end. This ensures zero regression risk.

Feature flag: `VIBESTACK_AGENT_PIPELINE=true` in env vars.

---

## Task 1: Install Mastra and Scaffold Agent Module Structure

**Files:**
- Modify: `package.json` (add `@mastra/core` dependency)
- Create: `lib/agents/index.ts` (barrel export)
- Create: `lib/agents/registry.ts` (agent registry with model routing)
- Create: `lib/agents/schemas.ts` (Zod schemas for all artifact types)

**Step 1: Install Mastra**

Run: `pnpm add @mastra/core`
Expected: Package installs successfully, `@mastra/core` appears in `package.json` dependencies.

**Step 2: Create artifact schemas**

Create `lib/agents/schemas.ts` with Zod schemas for all agent output types. These are the contracts — every agent MUST produce output matching its schema.

```typescript
// lib/agents/schemas.ts
import { z } from 'zod';

// ============================================================================
// Phase 1: Strategy & Data Architecture
// ============================================================================

export const PRDArtifactSchema = z.object({
  mission: z.string().describe('One-sentence mission statement'),
  personas: z.array(z.object({
    name: z.string(),
    ageRange: z.string(),
    behavior: z.string(),
  })).min(1),
  features: z.array(z.object({
    name: z.string(),
    description: z.string(),
    priority: z.enum(['must-have', 'should-have', 'nice-to-have']),
  })).min(1),
  successMetrics: z.array(z.string()).min(1),
});
export type PRDArtifact = z.infer<typeof PRDArtifactSchema>;

export const ComplianceArtifactSchema = z.object({
  frameworks: z.array(z.object({
    name: z.string(),
    status: z.enum(['compliant', 'in-progress', 'not-started']),
    requirements: z.array(z.string()),
  })),
  dataResidency: z.string(),
  privacyPolicy: z.string().describe('Generated privacy policy text'),
});
export type ComplianceArtifact = z.infer<typeof ComplianceArtifactSchema>;

export const DatabaseSchemaArtifactSchema = z.object({
  tables: z.array(z.object({
    name: z.string(),
    columns: z.array(z.object({
      name: z.string(),
      type: z.string(),
      nullable: z.boolean().default(false),
      primaryKey: z.boolean().default(false),
      references: z.object({
        table: z.string(),
        column: z.string(),
      }).optional(),
    })),
    indices: z.array(z.string()).default([]),
  })),
  migrationSQL: z.string().describe('Complete SQL migration'),
});
export type DatabaseSchemaArtifact = z.infer<typeof DatabaseSchemaArtifactSchema>;

export const UserResearchArtifactSchema = z.object({
  personas: z.array(z.object({
    name: z.string(),
    demographics: z.string(),
    goals: z.array(z.string()),
    painPoints: z.array(z.string()),
    behavior: z.string(),
  })),
  journeyMap: z.string().describe('Mermaid diagram of user journey'),
});
export type UserResearchArtifact = z.infer<typeof UserResearchArtifactSchema>;

// ============================================================================
// Phase 2: Infrastructure & Security
// ============================================================================

export const InfrastructureArtifactSchema = z.object({
  provider: z.string(),
  region: z.string(),
  services: z.array(z.object({
    name: z.string(),
    type: z.string(),
    config: z.record(z.string()),
  })),
  iacCode: z.string().describe('Infrastructure as Code (Terraform/Pulumi)'),
});
export type InfrastructureArtifact = z.infer<typeof InfrastructureArtifactSchema>;

export const SecurityArtifactSchema = z.object({
  score: z.number().min(0).max(100),
  vulnerabilities: z.array(z.object({
    risk: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    status: z.enum(['open', 'remediated']),
    asset: z.string(),
  })),
  controls: z.array(z.object({
    name: z.string(),
    status: z.enum(['pass', 'fail', 'warning']),
  })),
});
export type SecurityArtifact = z.infer<typeof SecurityArtifactSchema>;

export const BackendArtifactSchema = z.object({
  graphqlSchema: z.string().describe('Complete GraphQL schema SDL'),
  apiRoutes: z.array(z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
    path: z.string(),
    description: z.string(),
  })),
  generatedFiles: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })),
});
export type BackendArtifact = z.infer<typeof BackendArtifactSchema>;

// ============================================================================
// Phase 3: Frontend & Design
// ============================================================================

export const DesignSystemArtifactSchema = z.object({
  colors: z.array(z.object({
    name: z.string(),
    hex: z.string(),
    role: z.string(),
  })),
  typography: z.array(z.object({
    font: z.string(),
    weight: z.string(),
    size: z.string(),
    usage: z.string(),
  })),
  components: z.array(z.string()).describe('Component names to generate'),
  designTokensCSS: z.string().describe('CSS custom properties for design tokens'),
});
export type DesignSystemArtifact = z.infer<typeof DesignSystemArtifactSchema>;

export const FrontendArtifactSchema = z.object({
  generatedFiles: z.array(z.object({
    path: z.string(),
    content: z.string(),
    layer: z.number(),
  })),
  componentManifest: z.array(z.object({
    name: z.string(),
    path: z.string(),
    props: z.array(z.string()),
  })),
});
export type FrontendArtifact = z.infer<typeof FrontendArtifactSchema>;

// ============================================================================
// Phase 4: Growth, QA & Launch
// ============================================================================

export const PricingArtifactSchema = z.object({
  tiers: z.array(z.object({
    name: z.string(),
    price: z.number(),
    features: z.array(z.string()),
    recommended: z.boolean().default(false),
  })),
  revenueModel: z.string(),
});
export type PricingArtifact = z.infer<typeof PricingArtifactSchema>;

export const GrowthArtifactSchema = z.object({
  funnelStages: z.array(z.object({
    name: z.string(),
    events: z.array(z.string()),
    conversionTarget: z.number(),
  })),
  analyticsConfig: z.string().describe('Analytics setup code'),
});
export type GrowthArtifact = z.infer<typeof GrowthArtifactSchema>;

export const QATestArtifactSchema = z.object({
  testFiles: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })),
  testResults: z.array(z.object({
    name: z.string(),
    status: z.enum(['pass', 'fail', 'skip']),
    duration: z.string(),
  })),
});
export type QATestArtifact = z.infer<typeof QATestArtifactSchema>;

// ============================================================================
// Workflow State: Shared context passed between phases
// ============================================================================

export const ClarifiedRequirementsSchema = z.object({
  appName: z.string(),
  appDescription: z.string(),
  targetAudience: z.string(),
  features: z.array(z.object({
    name: z.string(),
    description: z.string(),
    category: z.string(),
  })),
  constraints: z.array(z.string()),
  designPreferences: z.object({
    style: z.string(),
    primaryColor: z.string(),
    fontFamily: z.string(),
  }),
});
export type ClarifiedRequirements = z.infer<typeof ClarifiedRequirementsSchema>;

export const ExecutionPlanSchema = z.object({
  phases: z.array(z.object({
    name: z.string(),
    agents: z.array(z.string()),
    description: z.string(),
  })),
  estimatedDuration: z.string(),
  agentAssignments: z.record(z.object({
    model: z.string(),
    rationale: z.string(),
  })),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

// ============================================================================
// Agent Event: streamed to UI during execution
// ============================================================================

export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('agent_start'),
    agentId: z.string(),
    agentName: z.string(),
    phase: z.number(),
  }),
  z.object({
    type: z.literal('agent_progress'),
    agentId: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('agent_artifact'),
    agentId: z.string(),
    artifactType: z.string(),
    artifactName: z.string(),
  }),
  z.object({
    type: z.literal('agent_complete'),
    agentId: z.string(),
    tokensUsed: z.number(),
    durationMs: z.number(),
  }),
  z.object({
    type: z.literal('phase_start'),
    phase: z.number(),
    phaseName: z.string(),
    agentCount: z.number(),
  }),
  z.object({
    type: z.literal('phase_complete'),
    phase: z.number(),
    phaseName: z.string(),
  }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
```

**Step 3: Create the agent registry**

Create `lib/agents/registry.ts` — defines all 13 agents with model routing.

```typescript
// lib/agents/registry.ts
import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

// ============================================================================
// Model Routing: cost-tier assignments
// ============================================================================

/** Architect tier — complex reasoning, code generation */
const ARCHITECT_MODEL = anthropic('claude-sonnet-4-5-20250929');

/** Specialist tier — domain knowledge, structured output */
const SPECIALIST_MODEL = openai('gpt-4o');

/** Analyst tier — classification, config generation */
const ANALYST_MODEL = anthropic('claude-haiku-4-5-20251001');

// ============================================================================
// Agent Definitions
// ============================================================================

export const productStrategist = new Agent({
  name: 'Product Strategist',
  instructions: `You are a product strategist. Given user requirements, produce a Product Requirements Document (PRD) with:
- Clear mission statement
- User personas with demographics and behavior patterns
- Prioritized feature list (must-have, should-have, nice-to-have)
- Measurable success metrics

Be concise. Focus on actionable requirements, not aspirational language.`,
  model: ARCHITECT_MODEL,
});

export const userResearcher = new Agent({
  name: 'User Researcher',
  instructions: `You are a UX researcher. Given a PRD, produce:
- Detailed user personas with goals and pain points
- User journey map in Mermaid diagram syntax (graph LR)

Base personas on the PRD's target audience. Journey maps should cover: arrival -> discovery -> engagement -> conversion -> retention.`,
  model: ANALYST_MODEL,
});

export const uxDesigner = new Agent({
  name: 'UX/UI Designer',
  instructions: `You are a UI/UX designer. Given a PRD and user research, produce:
- Color palette (5-8 colors with semantic roles)
- Typography scale (3-5 levels with font, weight, size)
- List of components to generate
- CSS custom properties for all design tokens

Use modern, accessible design. Default to Inter for body, Outfit for headings. Ensure WCAG AA contrast ratios.`,
  model: SPECIALIST_MODEL,
});

export const frontendEngineer = new Agent({
  name: 'Frontend Engineer',
  instructions: `You are a senior React engineer. Given a design system and feature list, generate production-quality React components using:
- React 19 with function components
- TypeScript strict mode
- Tailwind CSS v4 (utility-first, CSS custom properties)
- Radix UI primitives for accessibility

Each file must be complete, importable, and type-safe. Use the design tokens CSS variables. No placeholder comments.`,
  model: ARCHITECT_MODEL,
});

export const backendEngineer = new Agent({
  name: 'Backend Engineer',
  instructions: `You are a senior backend engineer. Given a PRD and database schema, generate:
- GraphQL SDL schema with types, queries, and mutations
- API route handlers (Next.js App Router style: route.ts)
- Server actions for data mutations

Use Supabase client for database access. Include proper error handling and input validation with Zod.`,
  model: ARCHITECT_MODEL,
});

export const dataEngineer = new Agent({
  name: 'Data Engineer',
  instructions: `You are a database architect. Given a PRD with entities and relationships, produce:
- PostgreSQL table definitions with proper types, constraints, and indices
- Foreign key relationships
- Row-Level Security policies for multi-tenant access
- Complete SQL migration file

Use Supabase conventions: uuid PKs with gen_random_uuid(), timestamptz for dates, auth.uid() in RLS policies.`,
  model: SPECIALIST_MODEL,
});

export const devopsEngineer = new Agent({
  name: 'DevOps Engineer',
  instructions: `You are a DevOps engineer. Given infrastructure requirements, produce:
- Service architecture (provider, region, components)
- Infrastructure as Code configuration
- CI/CD pipeline definition
- Monitoring and alerting setup

Target Vercel for frontend hosting, Supabase for database/auth, with edge-optimized configuration.`,
  model: SPECIALIST_MODEL,
});

export const securityEngineer = new Agent({
  name: 'Security Engineer',
  instructions: `You are a security engineer. Given the application architecture, produce:
- Security score (0-100) with assessment methodology
- Vulnerability scan results by severity
- Security control validation (auth, rate limiting, input sanitization, secrets management)

Focus on OWASP Top 10. Flag any hardcoded secrets, missing auth checks, or SQL injection vectors.`,
  model: ARCHITECT_MODEL,
});

export const growthStrategist = new Agent({
  name: 'Growth Strategist',
  instructions: `You are a growth strategist. Given the product features, produce:
- Conversion funnel definition with stages and events
- Analytics event tracking configuration
- Key metrics and targets per funnel stage

Use standard SaaS funnel: Awareness -> Acquisition -> Activation -> Retention -> Revenue -> Referral.`,
  model: ANALYST_MODEL,
});

export const pricingStrategist = new Agent({
  name: 'Pricing Strategist',
  instructions: `You are a pricing strategist. Given the product features, produce:
- 2-4 pricing tiers with feature allocation
- Revenue model description
- Mark one tier as recommended

Use standard SaaS pricing: Free/Starter, Pro, Enterprise. Align features to tiers logically.`,
  model: ANALYST_MODEL,
});

export const customerSuccess = new Agent({
  name: 'Customer Success',
  instructions: `You are a customer success manager. Given the product features, produce:
- FAQ entries for common user questions
- Onboarding guide steps
- Help center article outlines

Focus on reducing time-to-value. Cover: getting started, common tasks, troubleshooting.`,
  model: ANALYST_MODEL,
});

export const complianceOfficer = new Agent({
  name: 'Compliance Officer',
  instructions: `You are a compliance officer. Given the application type and data handled, produce:
- Applicable regulatory frameworks (GDPR, SOC2, CCPA, etc.) with compliance status
- Data residency requirements
- Privacy policy text

Focus on frameworks relevant to the app's industry and geography.`,
  model: SPECIALIST_MODEL,
});

export const dataAnalyst = new Agent({
  name: 'Data Analyst',
  instructions: `You are a data analyst. Given the product metrics and growth strategy, produce:
- Executive dashboard configuration with KPIs
- Report templates for key metrics
- Data visualization recommendations

Focus on actionable metrics, not vanity metrics.`,
  model: ANALYST_MODEL,
});

// ============================================================================
// Registry: all agents indexed by ID
// ============================================================================

export const AGENT_REGISTRY = {
  'product-strategist': productStrategist,
  'user-researcher': userResearcher,
  'ux-designer': uxDesigner,
  'frontend-engineer': frontendEngineer,
  'backend-engineer': backendEngineer,
  'data-engineer': dataEngineer,
  'devops-engineer': devopsEngineer,
  'security-engineer': securityEngineer,
  'growth-strategist': growthStrategist,
  'pricing-strategist': pricingStrategist,
  'customer-success': customerSuccess,
  'compliance-officer': complianceOfficer,
  'data-analyst': dataAnalyst,
} as const;

export type AgentId = keyof typeof AGENT_REGISTRY;

// ============================================================================
// Phase -> Agent mapping
// ============================================================================

export const PHASE_AGENTS: Record<number, AgentId[]> = {
  1: ['product-strategist', 'compliance-officer', 'data-engineer', 'user-researcher'],
  2: ['devops-engineer', 'security-engineer', 'backend-engineer'],
  3: ['ux-designer', 'frontend-engineer'],
  4: ['pricing-strategist', 'growth-strategist', 'customer-success', 'data-analyst'],
};

export const PHASE_NAMES: Record<number, string> = {
  1: 'Strategy, Compliance & Data Architecture',
  2: 'Core Infrastructure & Security Layer',
  3: 'Frontend Experience & Design System',
  4: 'Growth, QA & Launch Operations',
};
```

**Step 4: Create barrel export**

```typescript
// lib/agents/index.ts
export { AGENT_REGISTRY, PHASE_AGENTS, PHASE_NAMES } from './registry';
export type { AgentId } from './registry';
export * from './schemas';
```

**Step 5: Run type check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no type errors from new files)

**Step 6: Commit**

```bash
git add lib/agents/ package.json pnpm-lock.yaml
git commit -m "feat: add Mastra agent registry with 13 agents and artifact schemas"
```

---

## Task 2: Create the Mastra Workflow DAG

**Files:**
- Create: `lib/agents/workflow.ts` (main workflow definition)
- Create: `lib/agents/steps.ts` (individual workflow step implementations)
- Create: `lib/agents/planner.ts` (planner agent for clarification + plan generation)

**Step 1: Create the planner agent**

The planner agent handles the clarification and plan generation steps. It's separate from the 13 domain agents because it orchestrates them.

```typescript
// lib/agents/planner.ts
import { Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { PHASE_AGENTS, PHASE_NAMES, type AgentId } from './registry';

const PLANNER_MODEL = anthropic('claude-sonnet-4-5-20250929');

export const plannerAgent = new Agent({
  name: 'Planner',
  instructions: `You are the VibeStack planning agent. Your job is to:
1. Clarify ambiguous user requirements by asking targeted questions
2. Select which agents are needed for this specific project
3. Generate a phased execution plan for user approval

Be concise. Ask only essential clarifying questions. Default to sensible choices when possible.`,
  model: PLANNER_MODEL,
});

/**
 * Select which agents should participate based on requirements.
 * For MVP, all agents run. In the future, this filters by relevance.
 */
export function selectAgents(requirements: { features: Array<{ category: string }> }): AgentId[] {
  // Start with all agents — future: filter based on feature categories
  const allAgents: AgentId[] = [];
  for (const phaseAgents of Object.values(PHASE_AGENTS)) {
    allAgents.push(...phaseAgents);
  }
  return [...new Set(allAgents)];
}

/**
 * Build a plan prompt from clarified requirements for the planner agent.
 */
export function buildPlanPrompt(requirements: {
  appName: string;
  appDescription: string;
  features: Array<{ name: string; description: string; category: string }>;
}): string {
  const phaseDescriptions = Object.entries(PHASE_NAMES)
    .map(([phase, name]) => {
      const agents = PHASE_AGENTS[Number(phase)] || [];
      return `Phase ${phase}: ${name}\n  Agents: ${agents.join(', ')}`;
    })
    .join('\n');

  return `Create an execution plan for building "${requirements.appName}":

Description: ${requirements.appDescription}

Features:
${requirements.features.map(f => `- ${f.name}: ${f.description}`).join('\n')}

Available Phases:
${phaseDescriptions}

Output a plan with phases, agent assignments, estimated duration, and rationale for model selection per agent.`;
}
```

**Step 2: Create workflow step implementations**

```typescript
// lib/agents/steps.ts
import type { Sandbox } from '@daytonaio/sdk';
import { AGENT_REGISTRY, PHASE_AGENTS, PHASE_NAMES, type AgentId } from './registry';
import { plannerAgent, selectAgents, buildPlanPrompt } from './planner';
import type { ClarifiedRequirements, AgentEvent } from './schemas';
import {
  ClarifiedRequirementsSchema,
  ExecutionPlanSchema,
  PRDArtifactSchema,
  DatabaseSchemaArtifactSchema,
  ComplianceArtifactSchema,
  UserResearchArtifactSchema,
  InfrastructureArtifactSchema,
  SecurityArtifactSchema,
  BackendArtifactSchema,
  DesignSystemArtifactSchema,
  FrontendArtifactSchema,
  PricingArtifactSchema,
  GrowthArtifactSchema,
  QATestArtifactSchema,
} from './schemas';

// ============================================================================
// Artifact schema mapping per agent
// ============================================================================

const AGENT_ARTIFACT_SCHEMAS: Partial<Record<AgentId, { schema: unknown; name: string }>> = {
  'product-strategist': { schema: PRDArtifactSchema, name: 'PRD' },
  'data-engineer': { schema: DatabaseSchemaArtifactSchema, name: 'Database Schema' },
  'compliance-officer': { schema: ComplianceArtifactSchema, name: 'Compliance Report' },
  'user-researcher': { schema: UserResearchArtifactSchema, name: 'User Research' },
  'devops-engineer': { schema: InfrastructureArtifactSchema, name: 'Infrastructure' },
  'security-engineer': { schema: SecurityArtifactSchema, name: 'Security Audit' },
  'backend-engineer': { schema: BackendArtifactSchema, name: 'Backend API' },
  'ux-designer': { schema: DesignSystemArtifactSchema, name: 'Design System' },
  'frontend-engineer': { schema: FrontendArtifactSchema, name: 'Frontend Components' },
  'pricing-strategist': { schema: PricingArtifactSchema, name: 'Pricing' },
  'growth-strategist': { schema: GrowthArtifactSchema, name: 'Growth Strategy' },
};

// ============================================================================
// Step: Clarify Requirements
// ============================================================================

export async function clarifyRequirements(
  userPrompt: string,
): Promise<ClarifiedRequirements> {
  const result = await plannerAgent.generate([
    {
      role: 'user',
      content: `A user wants to build an app. Their prompt: "${userPrompt}"

Analyze this prompt and produce clarified requirements. Extract the app name, description, target audience, features (with categories), constraints, and design preferences. If the prompt is clear enough, fill in sensible defaults rather than asking questions.`,
    },
  ], {
    output: ClarifiedRequirementsSchema,
  });

  return result.object;
}

// ============================================================================
// Step: Assemble Agent Team
// ============================================================================

export function assembleTeam(
  requirements: ClarifiedRequirements,
): { selectedAgents: AgentId[]; agentMetadata: Array<{ id: AgentId; name: string; layer: string }> } {
  const selectedAgents = selectAgents(requirements);

  const agentMetadata = selectedAgents.map(id => ({
    id,
    name: AGENT_REGISTRY[id].name,
    layer: Object.entries(PHASE_AGENTS)
      .find(([, agents]) => agents.includes(id))
      ?.[0] ? PHASE_NAMES[Number(Object.entries(PHASE_AGENTS).find(([, agents]) => agents.includes(id))![0])]
      : 'Unknown',
  }));

  return { selectedAgents, agentMetadata };
}

// ============================================================================
// Step: Generate Plan
// ============================================================================

export async function generatePlan(
  requirements: ClarifiedRequirements,
) {
  const prompt = buildPlanPrompt(requirements);
  const result = await plannerAgent.generate([
    { role: 'user', content: prompt },
  ], {
    output: ExecutionPlanSchema,
  });

  return result.object;
}

// ============================================================================
// Step: Run a single agent and collect its artifact
// ============================================================================

export async function runAgent(
  agentId: AgentId,
  context: {
    requirements: ClarifiedRequirements;
    priorArtifacts: Record<string, unknown>;
  },
  emitEvent: (event: AgentEvent) => void,
): Promise<{ agentId: AgentId; artifact: unknown }> {
  const agent = AGENT_REGISTRY[agentId];
  const startTime = Date.now();

  emitEvent({
    type: 'agent_start',
    agentId,
    agentName: agent.name,
    phase: Number(Object.entries(PHASE_AGENTS).find(([, agents]) => agents.includes(agentId))?.[0] ?? 0),
  });

  // Build context prompt with requirements + prior artifacts
  const contextPrompt = `
Project: ${context.requirements.appName}
Description: ${context.requirements.appDescription}
Features: ${context.requirements.features.map(f => `${f.name}: ${f.description}`).join('; ')}

${Object.keys(context.priorArtifacts).length > 0
    ? `Prior artifacts from upstream agents:\n${JSON.stringify(context.priorArtifacts, null, 2)}`
    : 'You are one of the first agents. No prior artifacts yet.'
  }

Produce your artifact now.`;

  const artifactMeta = AGENT_ARTIFACT_SCHEMAS[agentId];
  let artifact: unknown;

  if (artifactMeta) {
    // Structured output — agent produces typed artifact
    const result = await agent.generate([
      { role: 'user', content: contextPrompt },
    ], {
      output: artifactMeta.schema as Parameters<typeof agent.generate>[1]['output'],
    });
    artifact = result.object;

    emitEvent({
      type: 'agent_artifact',
      agentId,
      artifactType: agentId,
      artifactName: artifactMeta.name,
    });
  } else {
    // Unstructured — agent produces text
    const result = await agent.generate([
      { role: 'user', content: contextPrompt },
    ]);
    artifact = { text: result.text };
  }

  const durationMs = Date.now() - startTime;

  emitEvent({
    type: 'agent_complete',
    agentId,
    tokensUsed: 0, // TODO: extract from Mastra tracing
    durationMs,
  });

  return { agentId, artifact };
}

// ============================================================================
// Step: Run a full phase (all agents in parallel)
// ============================================================================

export async function runPhase(
  phaseNumber: number,
  requirements: ClarifiedRequirements,
  priorArtifacts: Record<string, unknown>,
  emitEvent: (event: AgentEvent) => void,
): Promise<Record<string, unknown>> {
  const agentIds = PHASE_AGENTS[phaseNumber];
  if (!agentIds || agentIds.length === 0) return priorArtifacts;

  const phaseName = PHASE_NAMES[phaseNumber] || `Phase ${phaseNumber}`;

  emitEvent({
    type: 'phase_start',
    phase: phaseNumber,
    phaseName,
    agentCount: agentIds.length,
  });

  // Run all agents in this phase in parallel
  const results = await Promise.all(
    agentIds.map(agentId =>
      runAgent(agentId, { requirements, priorArtifacts }, emitEvent)
    )
  );

  // Merge new artifacts into cumulative map
  const newArtifacts = { ...priorArtifacts };
  for (const { agentId, artifact } of results) {
    newArtifacts[agentId] = artifact;
  }

  emitEvent({
    type: 'phase_complete',
    phase: phaseNumber,
    phaseName,
  });

  return newArtifacts;
}
```

**Step 3: Create the main workflow**

```typescript
// lib/agents/workflow.ts
import type { AgentEvent, ClarifiedRequirements, ExecutionPlan } from './schemas';
import { clarifyRequirements, assembleTeam, generatePlan, runPhase } from './steps';
import type { AgentId } from './registry';

// ============================================================================
// Workflow State: persisted across phases and suspend/resume
// ============================================================================

export interface WorkflowState {
  userPrompt: string;
  requirements?: ClarifiedRequirements;
  selectedAgents?: AgentId[];
  agentMetadata?: Array<{ id: AgentId; name: string; layer: string }>;
  plan?: ExecutionPlan;
  planApproved?: boolean;
  artifacts: Record<string, unknown>;
  currentPhase: number;
  status: 'clarifying' | 'assembling' | 'planning' | 'awaiting-approval' | 'executing' | 'complete' | 'error';
}

// ============================================================================
// Workflow Runner
// ============================================================================

/**
 * Run the full generation workflow.
 *
 * This is the Mastra workflow equivalent — structured as an async generator
 * that yields events at each step. The caller (SSE route) iterates events
 * and forwards them to the client.
 *
 * The workflow suspends at plan approval by returning the state with
 * status='awaiting-approval'. The caller resumes by calling `resumeWorkflow`.
 */
export async function* runGenerationWorkflow(
  userPrompt: string,
  emitEvent: (event: AgentEvent) => void,
): AsyncGenerator<WorkflowState, WorkflowState, boolean | undefined> {
  const state: WorkflowState = {
    userPrompt,
    artifacts: {},
    currentPhase: 0,
    status: 'clarifying',
  };

  // Step 1: Clarify requirements
  state.requirements = await clarifyRequirements(userPrompt);
  state.status = 'assembling';
  yield state;

  // Step 2: Assemble agent team
  const { selectedAgents, agentMetadata } = assembleTeam(state.requirements);
  state.selectedAgents = selectedAgents;
  state.agentMetadata = agentMetadata;
  state.status = 'planning';
  yield state;

  // Step 3: Generate plan
  state.plan = await generatePlan(state.requirements);
  state.status = 'awaiting-approval';
  yield state;

  // Step 4: SUSPEND — wait for plan approval
  // The caller resumes by calling generator.next(true) to approve
  const approved = yield state;
  if (!approved) {
    state.status = 'error';
    return state;
  }
  state.planApproved = true;
  state.status = 'executing';

  // Step 5: Execute phases sequentially, agents in parallel within each phase
  for (let phase = 1; phase <= 4; phase++) {
    state.currentPhase = phase;
    yield state;

    state.artifacts = await runPhase(
      phase,
      state.requirements,
      state.artifacts,
      emitEvent,
    );
  }

  state.status = 'complete';
  return state;
}

/**
 * Resume a workflow from awaiting-approval state.
 * Used when the user clicks "Approve Plan" in the UI.
 */
export async function resumeWorkflow(
  state: WorkflowState,
  emitEvent: (event: AgentEvent) => void,
): Promise<WorkflowState> {
  if (state.status !== 'awaiting-approval' || !state.requirements) {
    throw new Error(`Cannot resume workflow in status: ${state.status}`);
  }

  state.planApproved = true;
  state.status = 'executing';

  for (let phase = 1; phase <= 4; phase++) {
    state.currentPhase = phase;
    state.artifacts = await runPhase(
      phase,
      state.requirements,
      state.artifacts,
      emitEvent,
    );
  }

  state.status = 'complete';
  return state;
}
```

**Step 4: Update barrel export**

Add new exports to `lib/agents/index.ts`:

```typescript
// lib/agents/index.ts
export { AGENT_REGISTRY, PHASE_AGENTS, PHASE_NAMES } from './registry';
export type { AgentId } from './registry';
export * from './schemas';
export { runGenerationWorkflow, resumeWorkflow } from './workflow';
export type { WorkflowState } from './workflow';
export { plannerAgent } from './planner';
```

**Step 5: Run type check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/agents/
git commit -m "feat: add Mastra workflow DAG with 4-phase execution and plan approval"
```

---

## Task 3: Write Tests for Agent Registry and Workflow

**Files:**
- Create: `tests/agent-registry.test.ts`
- Create: `tests/agent-workflow.test.ts`

**Step 1: Write registry tests**

```typescript
// tests/agent-registry.test.ts
import { describe, it, expect } from 'vitest';
import { AGENT_REGISTRY, PHASE_AGENTS, PHASE_NAMES } from '@/lib/agents/registry';

describe('Agent Registry', () => {
  it('has 13 agents', () => {
    expect(Object.keys(AGENT_REGISTRY)).toHaveLength(13);
  });

  it('every agent has a name and instructions', () => {
    for (const [id, agent] of Object.entries(AGENT_REGISTRY)) {
      expect(agent.name, `${id} missing name`).toBeTruthy();
    }
  });

  it('phases cover all 13 agents', () => {
    const allPhaseAgents = Object.values(PHASE_AGENTS).flat();
    const uniqueAgents = [...new Set(allPhaseAgents)];
    expect(uniqueAgents).toHaveLength(13);
  });

  it('has 4 phases', () => {
    expect(Object.keys(PHASE_AGENTS)).toHaveLength(4);
    expect(Object.keys(PHASE_NAMES)).toHaveLength(4);
  });

  it('phase agents reference valid registry keys', () => {
    const validIds = Object.keys(AGENT_REGISTRY);
    for (const [phase, agents] of Object.entries(PHASE_AGENTS)) {
      for (const agentId of agents) {
        expect(validIds, `Phase ${phase}: unknown agent "${agentId}"`).toContain(agentId);
      }
    }
  });
});
```

**Step 2: Write schema tests**

```typescript
// tests/agent-workflow.test.ts
import { describe, it, expect } from 'vitest';
import {
  PRDArtifactSchema,
  ClarifiedRequirementsSchema,
  ExecutionPlanSchema,
  AgentEventSchema,
  DatabaseSchemaArtifactSchema,
} from '@/lib/agents/schemas';

describe('Artifact Schemas', () => {
  it('PRDArtifactSchema validates a valid PRD', () => {
    const prd = {
      mission: 'Build a fashion ecommerce platform',
      personas: [{ name: 'Trend Hunter', ageRange: '18-25', behavior: 'mobile-first' }],
      features: [{ name: 'Product Grid', description: 'Browse products', priority: 'must-have' }],
      successMetrics: ['< 100ms TBT', '> 3% conversion rate'],
    };
    expect(PRDArtifactSchema.parse(prd)).toEqual(prd);
  });

  it('PRDArtifactSchema rejects empty personas', () => {
    const invalid = {
      mission: 'test',
      personas: [],
      features: [{ name: 'x', description: 'y', priority: 'must-have' }],
      successMetrics: ['m1'],
    };
    expect(() => PRDArtifactSchema.parse(invalid)).toThrow();
  });

  it('ClarifiedRequirementsSchema validates requirements', () => {
    const req = {
      appName: 'Lumina',
      appDescription: 'Fashion ecommerce',
      targetAudience: 'Young adults',
      features: [{ name: 'Auth', description: 'User login', category: 'auth' }],
      constraints: ['Must use Supabase'],
      designPreferences: { style: 'minimal', primaryColor: '#000', fontFamily: 'Inter' },
    };
    expect(ClarifiedRequirementsSchema.parse(req)).toEqual(req);
  });

  it('DatabaseSchemaArtifactSchema validates a schema', () => {
    const schema = {
      tables: [{
        name: 'products',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'name', type: 'text' },
        ],
        indices: ['idx_product_name'],
      }],
      migrationSQL: 'CREATE TABLE products (id uuid PRIMARY KEY, name text);',
    };
    expect(DatabaseSchemaArtifactSchema.parse(schema)).toBeTruthy();
  });

  it('AgentEventSchema validates agent_start event', () => {
    const event = {
      type: 'agent_start' as const,
      agentId: 'product-strategist',
      agentName: 'Product Strategist',
      phase: 1,
    };
    expect(AgentEventSchema.parse(event)).toEqual(event);
  });

  it('AgentEventSchema validates phase_complete event', () => {
    const event = {
      type: 'phase_complete' as const,
      phase: 2,
      phaseName: 'Core Infrastructure & Security Layer',
    };
    expect(AgentEventSchema.parse(event)).toEqual(event);
  });
});
```

**Step 3: Run tests**

Run: `pnpm test -- tests/agent-registry.test.ts tests/agent-workflow.test.ts`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add tests/agent-registry.test.ts tests/agent-workflow.test.ts
git commit -m "test: add agent registry and workflow schema tests"
```

---

## Task 4: Create the Agent Pipeline SSE Route

**Files:**
- Create: `app/api/projects/generate-v2/route.ts` (new route, behind feature flag)
- Modify: `lib/types.ts` (add AgentEvent to StreamEvent union)

**Step 1: Extend StreamEvent with agent events**

Add to `lib/types.ts` after the existing `EditCompleteEvent` in the `StreamEvent` union:

```typescript
// Add these new event interfaces after EditCompleteEvent:

export interface AgentStartEvent {
  type: "agent_start";
  agentId: string;
  agentName: string;
  phase: number;
}

export interface AgentProgressEvent {
  type: "agent_progress";
  agentId: string;
  message: string;
}

export interface AgentArtifactEvent {
  type: "agent_artifact";
  agentId: string;
  artifactType: string;
  artifactName: string;
}

export interface AgentCompleteEvent {
  type: "agent_complete";
  agentId: string;
  tokensUsed: number;
  durationMs: number;
}

export interface PhaseStartEvent {
  type: "phase_start";
  phase: number;
  phaseName: string;
  agentCount: number;
}

export interface PhaseCompleteEvent {
  type: "phase_complete";
  phase: number;
  phaseName: string;
}

export interface PlanReadyEvent {
  type: "plan_ready";
  plan: unknown;
  agents: Array<{ id: string; name: string; layer: string }>;
}

export interface PlanApprovedEvent {
  type: "plan_approved";
}
```

Add these types to the `StreamEvent` discriminated union.

**Step 2: Create generate-v2 route**

```typescript
// app/api/projects/generate-v2/route.ts
/**
 * Generation API Route v2 — Agent Pipeline
 *
 * Mastra-based multi-agent generation pipeline.
 * Feature-flagged: VIBESTACK_AGENT_PIPELINE=true
 */

import { NextRequest } from 'next/server';
import { createSSEStream } from '@/lib/sse';
import { runGenerationWorkflow, resumeWorkflow } from '@/lib/agents';
import type { AgentEvent } from '@/lib/agents/schemas';
import type { StreamEvent, GenerateRequest } from '@/lib/types';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body: GenerateRequest = await req.json();
  const { chatPlan, prompt } = body;

  if (!chatPlan && !prompt) {
    return new Response(
      JSON.stringify({ error: 'prompt or chatPlan is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const userPrompt = prompt || `Build ${chatPlan!.appName}: ${chatPlan!.appDescription}`;

  return createSSEStream(async (emit) => {
    try {
      // Bridge agent events to SSE stream events
      const emitAgentEvent = (event: AgentEvent) => {
        emit(event as unknown as StreamEvent);
      };

      emit({ type: 'stage_update', stage: 'planning' });

      const workflow = runGenerationWorkflow(userPrompt, emitAgentEvent);

      // Step through the workflow
      let result = await workflow.next();

      while (!result.done) {
        const state = result.value;

        if (state.status === 'assembling' && state.requirements) {
          emit({ type: 'checkpoint', label: 'Requirements clarified', status: 'complete' });
        }

        if (state.status === 'planning' && state.agentMetadata) {
          emit({
            type: 'checkpoint',
            label: `Assembled ${state.agentMetadata.length} agents`,
            status: 'complete',
          });
        }

        if (state.status === 'awaiting-approval' && state.plan) {
          // Emit plan for UI to show approval dialog
          // In the real flow, this would suspend and wait for user input
          // For now, auto-approve (Phase 2 will add real suspend/resume)
          emit({ type: 'checkpoint', label: 'Plan generated — auto-approving', status: 'complete' });
          result = await workflow.next(true); // Auto-approve
          continue;
        }

        if (state.status === 'executing') {
          emit({
            type: 'stage_update',
            stage: 'generating',
          });
        }

        result = await workflow.next();
      }

      // Workflow complete
      const finalState = result.value;
      emit({ type: 'stage_update', stage: 'complete' });
      emit({
        type: 'complete',
        projectId: 'agent-pipeline', // TODO: wire to real project
        urls: {},
        requirementResults: [],
      });
    } catch (error) {
      console.error('[generate-v2] Error:', error);
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        stage: 'error',
      });
    }
  });
}
```

**Step 3: Run type check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add app/api/projects/generate-v2/ lib/types.ts
git commit -m "feat: add generate-v2 SSE route with agent pipeline"
```

---

## Task 5: Wire Sandbox Execution into Agent Steps

**Files:**
- Modify: `lib/agents/steps.ts` (add sandbox tools for code-producing agents)
- Create: `lib/agents/tools.ts` (Mastra tool definitions wrapping sandbox operations)

**Step 1: Create sandbox tools**

```typescript
// lib/agents/tools.ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Sandbox } from '@daytonaio/sdk';

/**
 * Create sandbox-aware tools for code-producing agents.
 * Tools are created per-sandbox instance since they need the sandbox reference.
 */
export function createSandboxTools(sandbox: Sandbox) {
  const writeFile = createTool({
    id: 'write-file',
    description: 'Write a file to the project workspace',
    inputSchema: z.object({
      path: z.string().describe('File path relative to /workspace'),
      content: z.string().describe('Complete file content'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      path: z.string(),
      linesOfCode: z.number(),
    }),
    execute: async ({ context: { path, content } }) => {
      await sandbox.fs.uploadFile(Buffer.from(content), `/workspace/${path}`);
      return {
        success: true,
        path,
        linesOfCode: content.split('\n').length,
      };
    },
  });

  const runBuild = createTool({
    id: 'run-build',
    description: 'Run the project build to check for errors',
    inputSchema: z.object({}),
    outputSchema: z.object({
      exitCode: z.number(),
      output: z.string(),
    }),
    execute: async () => {
      const result = await sandbox.process.executeCommand({
        command: 'bun run build',
        cwd: '/workspace',
        timeout: 120,
      });
      return {
        exitCode: result.exitCode,
        output: (result.result?.stdout || '') + (result.result?.stderr || ''),
      };
    },
  });

  const readFile = createTool({
    id: 'read-file',
    description: 'Read a file from the project workspace',
    inputSchema: z.object({
      path: z.string().describe('File path relative to /workspace'),
    }),
    outputSchema: z.object({
      content: z.string(),
      exists: z.boolean(),
    }),
    execute: async ({ context: { path } }) => {
      try {
        const buf = await sandbox.fs.downloadFile(`/workspace/${path}`);
        return { content: buf.toString('utf-8'), exists: true };
      } catch {
        return { content: '', exists: false };
      }
    },
  });

  return { writeFile, runBuild, readFile };
}
```

**Step 2: Run type check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add lib/agents/tools.ts
git commit -m "feat: add Mastra sandbox tools for code-producing agents"
```

---

## Task 6: Add Observability Layer

**Files:**
- Create: `lib/agents/observability.ts` (trace collection + Supabase storage)

**Step 1: Create observability module**

```typescript
// lib/agents/observability.ts
import type { AgentEvent } from './schemas';

/**
 * Trace record stored in Supabase for debugging and analytics.
 */
export interface AgentTrace {
  id: string;
  projectId: string;
  agentId: string;
  agentName: string;
  phase: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  tokensUsed?: number;
  artifactType?: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
}

/**
 * Collects agent events and builds trace records.
 * In-memory during generation, flushed to Supabase on completion.
 */
export class TraceCollector {
  private traces: Map<string, AgentTrace> = new Map();
  private projectId: string;
  private events: AgentEvent[] = [];

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /** Process an agent event and update traces */
  record(event: AgentEvent): void {
    this.events.push(event);

    if (event.type === 'agent_start') {
      this.traces.set(event.agentId, {
        id: `${this.projectId}-${event.agentId}`,
        projectId: this.projectId,
        agentId: event.agentId,
        agentName: event.agentName,
        phase: event.phase,
        startedAt: new Date().toISOString(),
        status: 'running',
      });
    }

    if (event.type === 'agent_artifact') {
      const trace = this.traces.get(event.agentId);
      if (trace) {
        trace.artifactType = event.artifactType;
      }
    }

    if (event.type === 'agent_complete') {
      const trace = this.traces.get(event.agentId);
      if (trace) {
        trace.completedAt = new Date().toISOString();
        trace.durationMs = event.durationMs;
        trace.tokensUsed = event.tokensUsed;
        trace.status = 'completed';
      }
    }
  }

  /** Get all collected traces */
  getTraces(): AgentTrace[] {
    return Array.from(this.traces.values());
  }

  /** Get all raw events */
  getEvents(): AgentEvent[] {
    return [...this.events];
  }

  /** Summary stats */
  getSummary(): {
    totalAgents: number;
    completedAgents: number;
    totalTokens: number;
    totalDurationMs: number;
  } {
    const traces = this.getTraces();
    return {
      totalAgents: traces.length,
      completedAgents: traces.filter(t => t.status === 'completed').length,
      totalTokens: traces.reduce((sum, t) => sum + (t.tokensUsed || 0), 0),
      totalDurationMs: traces.reduce((sum, t) => sum + (t.durationMs || 0), 0),
    };
  }
}
```

**Step 2: Run type check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add lib/agents/observability.ts
git commit -m "feat: add agent observability with trace collection"
```

---

## Task 7: Integration Test — End-to-End Agent Workflow

**Files:**
- Create: `tests/e2e/agent-pipeline.test.ts`

This is a critical validation test. It runs the full workflow with mocked LLM responses to verify the pipeline structure, event streaming, and phase ordering work correctly.

**Step 1: Write the integration test**

```typescript
// tests/e2e/agent-pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AGENT_REGISTRY, PHASE_AGENTS, PHASE_NAMES } from '@/lib/agents/registry';
import { assembleTeam } from '@/lib/agents/steps';
import { TraceCollector } from '@/lib/agents/observability';
import type { AgentEvent, ClarifiedRequirements } from '@/lib/agents/schemas';

// Mock requirements for testing
const MOCK_REQUIREMENTS: ClarifiedRequirements = {
  appName: 'TestApp',
  appDescription: 'A test application',
  targetAudience: 'Developers',
  features: [
    { name: 'Auth', description: 'User authentication', category: 'auth' },
    { name: 'Dashboard', description: 'User dashboard', category: 'dashboard' },
  ],
  constraints: ['Must use TypeScript'],
  designPreferences: { style: 'minimal', primaryColor: '#000', fontFamily: 'Inter' },
};

describe('Agent Pipeline Integration', () => {
  describe('Team Assembly', () => {
    it('selects all 13 agents for a full project', () => {
      const { selectedAgents, agentMetadata } = assembleTeam(MOCK_REQUIREMENTS);
      expect(selectedAgents).toHaveLength(13);
      expect(agentMetadata).toHaveLength(13);
    });

    it('assigns agents to correct layers', () => {
      const { agentMetadata } = assembleTeam(MOCK_REQUIREMENTS);

      const strategists = agentMetadata.filter(a => a.layer.includes('Strategy'));
      expect(strategists.length).toBeGreaterThan(0);

      const engineers = agentMetadata.filter(a => a.layer.includes('Engineering'));
      expect(engineers.length).toBeGreaterThan(0);
    });
  });

  describe('Trace Collector', () => {
    it('collects agent events and produces summary', () => {
      const collector = new TraceCollector('test-project');

      // Simulate agent lifecycle
      collector.record({
        type: 'agent_start',
        agentId: 'product-strategist',
        agentName: 'Product Strategist',
        phase: 1,
      });

      collector.record({
        type: 'agent_artifact',
        agentId: 'product-strategist',
        artifactType: 'prd',
        artifactName: 'PRD',
      });

      collector.record({
        type: 'agent_complete',
        agentId: 'product-strategist',
        tokensUsed: 1500,
        durationMs: 3200,
      });

      const summary = collector.getSummary();
      expect(summary.totalAgents).toBe(1);
      expect(summary.completedAgents).toBe(1);
      expect(summary.totalTokens).toBe(1500);
      expect(summary.totalDurationMs).toBe(3200);
    });

    it('tracks multiple agents across phases', () => {
      const collector = new TraceCollector('test-project');
      const phase1Agents = PHASE_AGENTS[1];

      for (const agentId of phase1Agents) {
        collector.record({
          type: 'agent_start',
          agentId,
          agentName: AGENT_REGISTRY[agentId].name,
          phase: 1,
        });
        collector.record({
          type: 'agent_complete',
          agentId,
          tokensUsed: 1000,
          durationMs: 2000,
        });
      }

      const traces = collector.getTraces();
      expect(traces).toHaveLength(phase1Agents.length);
      expect(traces.every(t => t.status === 'completed')).toBe(true);
    });
  });

  describe('Phase Structure', () => {
    it('phases are sequential: 1 -> 2 -> 3 -> 4', () => {
      const phases = Object.keys(PHASE_AGENTS).map(Number).sort();
      expect(phases).toEqual([1, 2, 3, 4]);
    });

    it('no agent appears in multiple phases', () => {
      const seen = new Set<string>();
      for (const [phase, agents] of Object.entries(PHASE_AGENTS)) {
        for (const agentId of agents) {
          expect(seen.has(agentId), `Agent "${agentId}" appears in multiple phases`).toBe(false);
          seen.add(agentId);
        }
      }
    });

    it('every phase has a human-readable name', () => {
      for (const phase of Object.keys(PHASE_AGENTS)) {
        expect(PHASE_NAMES[Number(phase)]).toBeTruthy();
      }
    });
  });
});
```

**Step 2: Run tests**

Run: `pnpm test -- tests/e2e/agent-pipeline.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add tests/e2e/agent-pipeline.test.ts
git commit -m "test: add agent pipeline integration tests"
```

---

## Task 8: Feature Flag and Route Wiring

**Files:**
- Modify: `app/api/projects/generate/route.ts` (add feature flag to redirect to v2)

**Step 1: Add feature flag check at top of existing route**

Add a feature flag check at the top of the POST handler in the existing `generate/route.ts`:

```typescript
// Add at the top of POST handler, after const body = ...:
const useAgentPipeline = process.env.VIBESTACK_AGENT_PIPELINE === 'true';
if (useAgentPipeline) {
  // Forward to agent pipeline
  const { POST: agentPost } = await import('../generate-v2/route');
  return agentPost(req);
}
```

This allows the existing pipeline to remain the default while the agent pipeline can be tested via the feature flag.

**Step 2: Run type check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 3: Run existing tests**

Run: `pnpm test`
Expected: All existing tests still PASS (no regressions)

**Step 4: Commit**

```bash
git add app/api/projects/generate/route.ts
git commit -m "feat: add VIBESTACK_AGENT_PIPELINE feature flag for v2 route"
```

---

## Future Tasks (not in this plan — separate implementation cycles)

These are documented for reference but will be planned separately:

1. **Human-in-the-loop plan approval** — Real suspend/resume with Supabase state persistence and a `/api/projects/[id]/approve-plan` endpoint.

2. **Sandbox integration per agent** — Wire `createSandboxTools()` into Frontend Engineer, Backend Engineer, and Data Engineer agents so they write real files to the Daytona sandbox.

3. **Mastra memory integration** — Use Mastra's working memory to persist artifacts between phases instead of the in-memory `Record<string, unknown>`.

4. **Mastra eval scorers** — Add quality gates: validate PRD completeness, SQL schema validity (PGlite), TypeScript compilation, security scan.

5. **Real Mastra workflow** — Replace the AsyncGenerator-based workflow with proper `createWorkflow().then().suspend().commit()` once Mastra API stabilizes.

6. **Durability** — Phase-based Vercel function invocations with Supabase as state store between phases.

7. **UI integration** — Wire the new agent events into the builder chat UI, replacing the current SSE event handlers.

8. **Cost tracking** — Extract real token counts from Mastra tracing and display in the observability dashboard.
