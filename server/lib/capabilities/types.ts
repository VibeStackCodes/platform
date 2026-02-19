import { z } from 'zod'
import type { TableDef } from '../schema-contract'

export type PageType =
  | 'public-list'
  | 'public-detail'
  | 'crud-list'
  | 'crud-detail'
  | 'interactive'
  | 'static'

export interface PageDef {
  path: string
  type: PageType
  entity?: string
  component?: string
  template?: string
}

export type ComponentType = 'floating' | 'embedded' | 'modal' | 'sidebar'

export interface ComponentDef {
  name: string
  type: ComponentType
  props?: Record<string, string>
}

export type NavPosition = 'main' | 'footer' | 'sidebar' | 'none'

export interface NavEntry {
  label: string
  path: string
  position: NavPosition
  icon?: string
  order?: number
}

export interface DesignHints {
  cardStyle?: 'media-heavy' | 'text-first' | 'compact' | 'glass'
  heroType?: 'featured-item' | 'text-centered' | 'image-split' | 'none'
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'fullscreen'
  style?: 'glass' | 'solid' | 'outlined' | 'minimal'
  [key: string]: string | undefined
}

export interface RuntimeConfig {
  type: 'managed'
  service: 'mastra-agent' | 'rag-pipeline' | 'webhook-relay' | 'analytics-ingest'
  config: Record<string, unknown>
}

export interface Capability {
  name: string
  version: number
  description: string
  schema: TableDef[]
  pages: PageDef[]
  components: ComponentDef[]
  dependencies: {
    npm: Record<string, string>
    capabilities: string[]
  }
  navEntries: NavEntry[]
  designHints: DesignHints
  runtime?: RuntimeConfig
}

const PageDefSchema = z.object({
  path: z.string().min(1),
  type: z.enum(['public-list', 'public-detail', 'crud-list', 'crud-detail', 'interactive', 'static']),
  entity: z.string().optional(),
  component: z.string().optional(),
  template: z.string().optional(),
})

const ComponentDefSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['floating', 'embedded', 'modal', 'sidebar']),
  props: z.record(z.string(), z.string()).optional(),
})

const NavEntrySchema = z.object({
  label: z.string().min(1),
  path: z.string().min(1),
  position: z.enum(['main', 'footer', 'sidebar', 'none']),
  icon: z.string().optional(),
  order: z.number().optional(),
})

const RuntimeConfigSchema = z.object({
  type: z.literal('managed'),
  service: z.enum(['mastra-agent', 'rag-pipeline', 'webhook-relay', 'analytics-ingest']),
  config: z.record(z.string(), z.unknown()),
})

export const CapabilitySchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive(),
  description: z.string().min(1),
  schema: z.array(z.object({
    name: z.string(),
    columns: z.array(z.unknown()),
  }).passthrough()),
  pages: z.array(PageDefSchema),
  components: z.array(ComponentDefSchema),
  dependencies: z.object({
    npm: z.record(z.string(), z.string()),
    capabilities: z.array(z.string()),
  }),
  navEntries: z.array(NavEntrySchema),
  designHints: z.record(z.string(), z.string().optional()),
  runtime: RuntimeConfigSchema.optional(),
})
