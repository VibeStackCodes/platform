// server/lib/skills/catalog/editorial-glamorama/index.ts

import type { SchemaContract } from '../../../schema-contract'
import type { VibeStackSkill } from '../../types'

export const skill: VibeStackSkill = {
  name: 'editorial-glamorama',
  envVars: [],

  applyToSchema(contract: SchemaContract) {
    // Add image_url to any table that looks like it should have visual media
    const imageRelevantTables = ['articles', 'posts', 'portfolios', 'products', 'recipes', 'items']
    
    return {
      ...contract,
      tables: contract.tables.map(table => {
        const isRelevant = imageRelevantTables.some(kw => table.name.toLowerCase().includes(kw))
        const hasImage = table.columns.some(c => c.name.toLowerCase().includes('image'))
        
        if (isRelevant && !hasImage) {
          return {
            ...table,
            columns: [
              ...table.columns,
              {
                name: 'image_url',
                type: 'text' as const,
                nullable: true,
                default: undefined
              }
            ]
          }
        }
        return table
      })
    }
  },

  generateRoutes(_contract: SchemaContract) {
    // TODO: Implement editorial specific page templates (Rich Editorial List/Detail)
    return {}
  }
}
