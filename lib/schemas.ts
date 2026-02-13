import { z } from 'zod';

/**
 * Centralized Zod Schemas
 */

// ============================================================================
// Plan Schemas
// ============================================================================

export const RequirementCategorySchema = z.enum([
  'auth', 'crud', 'realtime', 'ui', 'integration', 'navigation',
]);

export const RequirementSchema = z.object({
  id: z.string(),
  description: z.string(),
  category: RequirementCategorySchema,
  verifiable: z.boolean(),
});

export const FileSpecSchema = z.object({
  path: z.string(),
  description: z.string(),
  layer: z.number(),
  dependsOn: z.array(z.string()),
  requirements: z.array(z.string()),
  skills: z.array(z.string()),
});

export const SupabaseSchemaSchema = z.object({
  migrationSQL: z.string(),
  seedSQL: z.string().nullable(),
  rls: z.string(),
  storageBuckets: z.array(z.string()),
  realtimeTables: z.array(z.string()),
});

export const DesignTokensSchema = z.object({
  primaryColor: z.string(),
  accentColor: z.string(),
  fontFamily: z.string(),
  spacing: z.enum(['compact', 'comfortable', 'spacious']),
  borderRadius: z.enum(['none', 'small', 'medium', 'large']),
});

export const PackageDependenciesSchema = z.record(z.string(), z.string());

export const FeatureCategorySchema = z.enum([
  'auth', 'crud', 'realtime', 'dashboard', 'messaging', 'ui',
]);

export const EntityFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['text', 'number', 'boolean', 'enum', 'uuid', 'timestamp', 'json']),
  required: z.boolean(),
  enumValues: z.array(z.string()).optional(),
});

export const EntitySpecSchema = z.object({
  name: z.string().describe('Singular noun, e.g. "task", "bed", "patient"'),
  fields: z.array(EntityFieldSchema),
  belongsTo: z.array(z.string()).optional().describe('FK relationships, e.g. ["ward", "user"]'),
});

export const FeatureSpecSchema = z.object({
  description: z.string().describe('What this feature does'),
  category: FeatureCategorySchema,
  entity: EntitySpecSchema.optional(),
});

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
  shadcnComponents: z.array(z.string()).describe('UI components needed: accordion, alert, avatar, badge, checkbox, dialog, dropdown-menu, popover, progress, radio-group, scroll-area, select, separator, switch, table, tabs, textarea, tooltip'),
});

export const EntityConfigSchema = z.object({
  entity: z.string().describe('Singular entity name'),
  tableName: z.string().describe('Postgres table name'),
  fields: z.array(EntityFieldSchema),
  belongsTo: z.array(z.string()).optional(),
  hasRealtime: z.boolean().optional(),
});

export const PlanSchema = z.object({
  appName: z.string(),
  appDescription: z.string(),
  requirements: z.array(RequirementSchema),
  files: z.array(FileSpecSchema),
  supabase: SupabaseSchemaSchema,
  designTokens: DesignTokensSchema,
  packageDeps: PackageDependenciesSchema,
});

// ============================================================================
// Verification Schemas
// ============================================================================

export const ErrorAnalysisSchema = z.object({
  errors: z.array(z.object({
    file: z.string(),
    line: z.number().nullable(),
    errorType: z.enum(['type_error', 'import_error', 'module_not_found', 'syntax_error', 'runtime_error', 'other']),
    message: z.string(),
    suggestedFix: z.string(),
  })),
  rootCause: z.string(),
  fixOrder: z.array(z.string()).describe('File paths in order they should be fixed'),
});

export const PlaywrightTestSchema = z.object({
  testFileContent: z.string(),
  testCount: z.number(),
  requirementsCovered: z.array(z.string()),
});

// ============================================================================
// Inferred Types
// ============================================================================

export type ErrorAnalysis = z.infer<typeof ErrorAnalysisSchema>;
export type PlaywrightTest = z.infer<typeof PlaywrightTestSchema>;
