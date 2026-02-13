import type { EntityConfig, FeatureSpec } from './types';

/**
 * Extract EntityConfig from ChatPlan features.
 * Since the ChatPlan already has structured entities, this is a simple
 * transformation — no LLM needed.
 */
export function extractEntityConfig(feature: FeatureSpec): EntityConfig | null {
  if (!feature.entity) return null;
  const { name, fields, belongsTo } = feature.entity;
  return {
    entity: name,
    tableName: pluralizeTable(name),
    fields,
    belongsTo,
    hasRealtime: false,
  };
}

export function extractAllEntities(features: FeatureSpec[]): EntityConfig[] {
  const configs: EntityConfig[] = [];
  const seen = new Set<string>();

  for (const feature of features) {
    const config = extractEntityConfig(feature);
    if (config && !seen.has(config.entity)) {
      seen.add(config.entity);
      const hasRealtime = features.some(
        f => f.category === 'realtime' &&
        f.description.toLowerCase().includes(config.entity)
      );
      configs.push({ ...config, hasRealtime });
    }
  }

  return configs;
}

function pluralizeTable(name: string): string {
  if (name.endsWith('s')) return name + 'es';
  if (name.endsWith('y') && !/[aeiou]y$/.test(name)) return name.slice(0, -1) + 'ies';
  return name + 's';
}
