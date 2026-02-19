// server/lib/skills/types.ts

import type { SchemaContract } from '../schema-contract'

export interface VibeStackSkill {
  name: string

  /**
   * Modifies the SchemaContract based on the skill's needs.
   * e.g., adding a 'user_id' column for authentication.
   */
  applyToSchema(contract: SchemaContract, config?: unknown): SchemaContract

  /**
   * Generates additional SQL migrations for custom logic
   * (e.g., triggers, stored procedures).
   */
  generateSQL?(contract: SchemaContract, config?: unknown): string

  /**
   * Generates custom routes/pages for the app.
   * Map of path -> React code string.
   */
  generateRoutes?(contract: SchemaContract, config?: unknown): Record<string, string>

  /**
   * Environment variables this skill requires (e.g., STRIPE_SECRET_KEY).
   */
  envVars: string[]
}
