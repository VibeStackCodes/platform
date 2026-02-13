import type { EntityField, FeatureSpec, TemplateTask } from './types';

// Fields the CRUD template hardcodes — strip from entity.fields to prevent TS2300 duplicates
const TEMPLATE_RESERVED_FIELDS = new Set(['id', 'created_at', 'updated_at']);

/**
 * Sanitize entity fields: remove template-reserved fields and belongsTo-derived
 * FK fields (those are emitted separately by the template's {{#each belongsTo}} block).
 * Deduplicates by field name.
 */
function sanitizeEntityFields(
  fields: EntityField[],
  belongsTo?: string[],
): EntityField[] {
  // Build set of names to exclude: reserved + belongsTo-derived FK names
  const exclude = new Set<string>(TEMPLATE_RESERVED_FIELDS);
  for (const relation of belongsTo ?? []) {
    exclude.add(`${relation}_id`);
  }

  const seen = new Set<string>();
  const result: EntityField[] = [];

  for (const field of fields) {
    if (exclude.has(field.name)) continue;
    if (seen.has(field.name)) continue;
    seen.add(field.name);
    result.push(field);
  }

  return result;
}

/**
 * Classify ChatPlan features into template tasks.
 * Uses the structured category from FeatureSpec — no regex guessing needed.
 */
export function classifyFeatures(features: FeatureSpec[]): TemplateTask[] {
  const tasks: TemplateTask[] = [{ template: 'scaffold', config: {} }];
  const seen = new Set<string>();

  for (const feature of features) {
    const { category, description, entity } = feature;

    if (category === 'auth' && !seen.has('auth')) {
      seen.add('auth');
      tasks.push({
        template: 'auth',
        config: { hasRoles: /role/i.test(description) },
      });
    }

    if (category === 'crud' && entity) {
      const key = `crud:${entity.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push({
          template: 'crud',
          config: {
            entity: entity.name,
            tableName: pluralizeTable(entity.name),
            fields: sanitizeEntityFields(entity.fields, entity.belongsTo),
            belongsTo: entity.belongsTo ?? [],
          },
          llmTask: description,
        });
      }
    }

    if (category === 'realtime' && !seen.has('realtime')) {
      seen.add('realtime');
      tasks.push({
        template: 'realtime',
        config: { channel: entity?.name ?? 'updates' },
        llmTask: description,
      });
    }

    if (category === 'dashboard' && !seen.has('dashboard')) {
      seen.add('dashboard');
      tasks.push({ template: 'dashboard', config: {} });
    }

    if (category === 'messaging' && !seen.has('messaging')) {
      seen.add('messaging');
      tasks.push({ template: 'messaging', config: {} });
    }
  }

  return tasks;
}

function pluralizeTable(name: string): string {
  if (name.endsWith('s')) return name + 'es';
  if (name.endsWith('y') && !/[aeiou]y$/.test(name)) return name.slice(0, -1) + 'ies';
  return name + 's';
}
