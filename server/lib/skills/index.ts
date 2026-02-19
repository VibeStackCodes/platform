// server/lib/skills/index.ts
//
// Shared SkillProps type and dispatcher functions for all skill templates.
// Each skill is a function: (props: SkillProps) => string (React component code string).

import type { SchemaContract } from '../schema-contract'
import type { HeroImage, EntityLayout } from '../design-spec'
import type { PageFeatureSpec } from '../agents/feature-schema'

export type { HeroImage, EntityLayout }

// Re-export PageFeatureSpec as SkillPageFeatureSpec for skill assembler use
export type { PageFeatureSpec as SkillPageFeatureSpec }

export interface SkillProps {
  // Entity identity
  entity: string
  contract: SchemaContract

  // Page feature spec (from inferPageConfig + derivePageFeatureSpec)
  spec: PageFeatureSpec

  // Design context
  layout: EntityLayout
  primaryColor: string
  fontFamily: string

  // Hero images (empty if Unsplash not configured)
  heroImages: HeroImage[]
}

// ── List skill dispatcher ────────────────────────────────────────────────────

export async function renderListSkill(skillName: string, props: SkillProps): Promise<string> {
  switch (skillName) {
    case 'CardGrid': {
      const { assembleCardGridPage } = await import('./list')
      return assembleCardGridPage(props)
    }
    case 'MenuGrid': {
      const { assembleMenuGridPage } = await import('./list')
      return assembleMenuGridPage(props)
    }
    case 'MagazineGrid': {
      const { assembleMagazineGridPage } = await import('./list')
      return assembleMagazineGridPage(props)
    }
    case 'TransactionFeed': {
      const { assembleTransactionFeedPage } = await import('./list')
      return assembleTransactionFeedPage(props)
    }
    case 'AuthorProfiles': {
      const { assembleAuthorProfilesPage } = await import('./list')
      return assembleAuthorProfilesPage(props)
    }
    default:
      return '' // empty string signals "use legacy assembler fallback"
  }
}

// ── Detail skill dispatcher ──────────────────────────────────────────────────

export async function renderDetailSkill(skillName: string, props: SkillProps): Promise<string> {
  switch (skillName) {
    case 'ProductDetail': {
      const { assembleProductDetailPage } = await import('./detail')
      return assembleProductDetailPage(props)
    }
    case 'ArticleReader': {
      const { assembleArticleReaderPage } = await import('./detail')
      return assembleArticleReaderPage(props)
    }
    case 'ProfileCard': {
      const { assembleProfileCardPage } = await import('./detail')
      return assembleProfileCardPage(props)
    }
    case 'AppointmentCard': {
      const { assembleAppointmentCardPage } = await import('./detail')
      return assembleAppointmentCardPage(props)
    }
    default:
      return '' // use legacy assembleDetailPage
  }
}

// ── Theme skills registry ────────────────────────────────────────────────────

/**
 * Import theme skills
 * Each theme skill is a complete package: schema + routes + seed data + validation
 */
import { canapeThemeSkill } from './canape'

export { canapeThemeSkill }

/**
 * Theme skills registry
 * Maps theme IDs to their skill definitions for discovery and dispatch
 */
export const THEME_SKILLS = {
  'theme-canape': canapeThemeSkill,
  // Future themes will be added here
  // 'theme-quomi': quomiThemeSkill,
  // 'theme-clune': cluneThemeSkill,
} as const

/**
 * Get theme skill by ID
 */
export function getThemeSkill(themeId: string) {
  return THEME_SKILLS[themeId as keyof typeof THEME_SKILLS]
}

/**
 * Get all available theme skills with metadata
 */
export function getAllThemeSkills() {
  return Object.entries(THEME_SKILLS).map(([id, skill]) => ({
    id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    domain: skill.metadata?.domain,
    tags: skill.metadata?.tags,
  }))
}

/**
 * Filter theme skills by domain (e.g., 'restaurant', 'ecommerce', 'blog')
 */
export function getThemeSkillsByDomain(domain: string) {
  return Object.entries(THEME_SKILLS)
    .filter(([, skill]) => skill.metadata?.domain === domain)
    .map(([id, skill]) => ({
      id,
      name: skill.name,
      description: skill.description,
      version: skill.version,
    }))
}
