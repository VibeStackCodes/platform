import { generateText } from 'ai';
import { zodTextFormat } from 'openai/helpers/zod';
import { resolveModel } from './models';
import { getOpenAIClient, PLAN_MODEL, REASONING_PRESETS, isOpenAIModel } from './openai-client';
import type { Plan } from './types';
import { PlanSchema } from './schemas';

/**
 * Planner Module
 *
 * Generates execution plans from user prompts using OpenAI or Claude APIs.
 * Plans include file architecture, requirements, Supabase schema, and design tokens.
 *
 * Uses OpenAI Responses API with Structured Outputs (zodTextFormat) for GPT models.
 * Falls back to AI SDK generateText for Anthropic models.
 */

// ============================================================================
// Available Skills
// ============================================================================

/**
 * Skills available for injection into file generation prompts
 * These are referenced in FileSpec.skills[]
 */
const AVAILABLE_SKILLS = [
  'supabase-auth',
  'supabase-crud',
  'supabase-realtime',
  'supabase-storage',
  'next-app-router',
  'next-server-actions',
  'next-middleware',
  'react-forms',
  'react-data-fetching',
  'shadcn-ui-components',
  'tailwind-styling',
  'zod-validation',
];

// ============================================================================
// System Prompt
// ============================================================================

const PLANNER_SYSTEM_PROMPT = `You are an expert software architect for VibeStack, a platform that generates full-stack Next.js applications.

Your job is to analyze user prompts and generate detailed execution plans as JSON.

## Plan Requirements

1. **File Architecture (8-20 files)**
   - Start with 8-20 files total (including config files, components, pages, API routes, lib utilities)
   - Use Next.js 16 App Router structure
   - Every requirement MUST be covered by at least one file
   - Organize into layers by dependency order

2. **Dependency Layers**
   - Layer 0: No dependencies (types, config, utilities)
   - Layer 1+: Can import from lower layers only
   - Files in the SAME layer MUST NOT import each other
   - Use the "dependsOn" array to specify file dependencies (use file paths)

3. **Requirements Coverage**
   - Break down user prompt into 3-8 specific requirements
   - Each requirement gets an ID, description, category, and verifiable flag
   - Every requirement must be addressed by at least one file (use requirements array in FileSpec)
   - Categories: "auth", "crud", "realtime", "ui", "integration", "navigation"

4. **Supabase Schema**
   - Always include a Supabase schema with migration SQL
   - Include RLS policies for security
   - Add seed data SQL if the prompt implies sample data
   - Specify storage buckets if file uploads are mentioned
   - List realtime tables if real-time features are needed

5. **Design Tokens**
   - Choose appropriate design tokens based on the app's purpose
   - primaryColor: hex color
   - accentColor: hex color
   - fontFamily: "Inter", "Roboto", "Poppins", "Playfair Display", etc.
   - spacing: "compact" | "comfortable" | "spacious"
   - borderRadius: "none" | "small" | "medium" | "large"

6. **Package Dependencies**
   - Include all necessary npm packages with versions
   - Always include: "next": "16.1.6", "react": "19.2.3", "@supabase/ssr": "^0.8.0", "zod": "^4.3.6"
   - Add extras based on requirements (e.g., "stripe" for payments, "lucide-react" for icons)

7. **Skills**
   - Reference available skills in FileSpec.skills[] to guide file generation
   - Available skills: ${AVAILABLE_SKILLS.join(', ')}
   - Choose skills relevant to each file's purpose

## Output Format

Return ONLY valid JSON (no markdown fences, no explanation):

{
  "appName": "Concise app name (3-5 words)",
  "appDescription": "One sentence describing the app",
  "requirements": [
    {
      "id": "req-1",
      "description": "Clear, specific requirement",
      "category": "auth" | "crud" | "realtime" | "ui" | "integration" | "navigation",
      "verifiable": true | false
    }
  ],
  "files": [
    {
      "path": "lib/types.ts",
      "description": "Core TypeScript type definitions",
      "layer": 0,
      "dependsOn": [],
      "requirements": ["req-1"],
      "skills": ["zod-validation"]
    },
    {
      "path": "lib/supabase/client.ts",
      "description": "Supabase browser client",
      "layer": 0,
      "dependsOn": [],
      "requirements": ["req-2"],
      "skills": ["supabase-auth"]
    },
    {
      "path": "app/dashboard/page.tsx",
      "description": "Main dashboard page",
      "layer": 2,
      "dependsOn": ["lib/types.ts", "lib/supabase/client.ts"],
      "requirements": ["req-3"],
      "skills": ["react-data-fetching", "shadcn-ui-components"]
    }
  ],
  "supabase": {
    "migrationSQL": "CREATE TABLE users (id UUID PRIMARY KEY, email TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());",
    "seedSQL": "INSERT INTO users (id, email) VALUES (gen_random_uuid(), 'demo@example.com');",
    "rls": "ALTER TABLE users ENABLE ROW LEVEL SECURITY; CREATE POLICY \\"Users can read own data\\" ON users FOR SELECT USING (auth.uid() = id);",
    "storageBuckets": ["avatars"],
    "realtimeTables": ["messages"]
  },
  "designTokens": {
    "primaryColor": "#3b82f6",
    "accentColor": "#8b5cf6",
    "fontFamily": "Inter",
    "spacing": "comfortable",
    "borderRadius": "medium"
  },
  "packageDeps": {
    "next": "16.1.6",
    "react": "19.2.3",
    "@supabase/ssr": "^0.8.0",
    "zod": "^4.3.6",
    "lucide-react": "^0.563.0"
  }
}

## Important Rules

- Output ONLY JSON, no markdown code fences, no explanations
- Ensure every requirement is covered by at least one file
- Layer 0 files have no dependencies
- Files in the same layer cannot import each other
- Always include Supabase schema with RLS
- Use realistic design tokens appropriate to the app
- Include seed data when the prompt implies sample/demo data`;

// ============================================================================
// Plan Generation
// ============================================================================

/**
 * Generate an execution plan from a user prompt
 *
 * Uses OpenAI Responses API with Structured Outputs for GPT models.
 * Falls back to AI SDK generateText for Anthropic Claude models.
 *
 * @param prompt - User's natural language prompt describing the app
 * @param model - Model to use (default: gpt-5.2)
 * @returns Generated plan with file architecture and requirements
 */
export async function generatePlan(
  prompt: string,
  model: string = PLAN_MODEL
): Promise<Plan> {
  try {
    console.log(`Generating plan with ${model}...`);

    let plan: Plan;

    if (isOpenAIModel(model)) {
      // Use OpenAI Responses API with Structured Outputs
      const client = getOpenAIClient();
      const response = await client.responses.parse({
        model,
        instructions: PLANNER_SYSTEM_PROMPT,
        input: [
          { role: 'user', content: prompt },
        ],
        text: {
          format: zodTextFormat(PlanSchema, 'plan'),
        },
        reasoning: { effort: REASONING_PRESETS.planning },
      });

      plan = response.output_parsed as Plan;
    } else {
      // Fallback to AI SDK for non-OpenAI models (e.g., Claude)
      const { text } = await generateText({
        model: resolveModel(model),
        system: PLANNER_SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 16000,
        temperature: 1.0,
      });

      // Strip markdown fences if present
      let rawResponse = text.trim();
      if (rawResponse.startsWith('```json')) {
        rawResponse = rawResponse.replace(/^```json\s*\n/, '').replace(/\n```\s*$/, '');
      } else if (rawResponse.startsWith('```')) {
        rawResponse = rawResponse.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '');
      }

      // Parse JSON
      plan = JSON.parse(rawResponse);
    }

    // Validate coverage
    validatePlan(plan);

    console.log(`✓ Plan generated: ${plan.appName}`);
    console.log(`  - ${plan.requirements.length} requirements`);
    console.log(`  - ${plan.files.length} files`);
    console.log(`  - ${Object.keys(plan.packageDeps).length} dependencies`);

    return plan;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse plan JSON: ${error.message}`);
    }
    throw new Error(`Plan generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that the plan meets all requirements
 */
export function validatePlan(plan: Plan): void {
  // Check file count
  if (plan.files.length < 8 || plan.files.length > 20) {
    console.warn(`⚠ Plan has ${plan.files.length} files (expected 8-20)`);
  }

  // Check requirement coverage
  const coveredRequirements = new Set<string>();
  plan.files.forEach(file => {
    file.requirements.forEach(reqId => coveredRequirements.add(reqId));
  });

  const uncoveredRequirements = plan.requirements
    .map(req => req.id)
    .filter(reqId => !coveredRequirements.has(reqId));

  if (uncoveredRequirements.length > 0) {
    throw new Error(
      `Plan validation failed: Requirements not covered by any file: ${uncoveredRequirements.join(', ')}`
    );
  }

  // Check layer 0 has no dependencies
  const layer0Files = plan.files.filter(f => f.layer === 0);
  const layer0WithDeps = layer0Files.filter(f => f.dependsOn.length > 0);
  if (layer0WithDeps.length > 0) {
    throw new Error(
      `Plan validation failed: Layer 0 files must have no dependencies: ${layer0WithDeps.map(f => f.path).join(', ')}`
    );
  }

  // Check same-layer imports
  for (const file of plan.files) {
    const sameLayerDeps = file.dependsOn.filter(depPath => {
      const dep = plan.files.find(f => f.path === depPath);
      return dep && dep.layer === file.layer;
    });

    if (sameLayerDeps.length > 0) {
      throw new Error(
        `Plan validation failed: File ${file.path} (layer ${file.layer}) imports from same layer: ${sameLayerDeps.join(', ')}`
      );
    }
  }

  console.log('✓ Plan validation passed');
}
