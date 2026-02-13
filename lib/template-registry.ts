import Handlebars from 'handlebars';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { pascalCase, camelCase } from 'change-case';
import type { TemplateTask, DesignTokens, GeneratedFile, TemplateName } from './types';
import { pluralizeTable } from './utils';
import { colord } from 'colord';
import type { SchemaContract, TableDef, ColumnDef, SQLType } from './schema-contract';

// ============================================================================
// Handlebars Helpers
// ============================================================================

Handlebars.registerHelper('pascalCase', (str: string) => pascalCase(str));

Handlebars.registerHelper('camelCase', (str: string) => camelCase(str));

Handlebars.registerHelper('pluralize', (str: string) => pluralizeTable(str));

Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

// ============================================================================
// Template Loading
// ============================================================================

interface CompiledTemplate {
  outputPath: string;
  template: Handlebars.TemplateDelegate;
}

function getTemplatesDir(): string {
  return join(process.cwd(), 'templates');
}

function loadTemplateDir(templateDir: string): CompiledTemplate[] {
  if (!existsSync(templateDir)) return [];
  const files: CompiledTemplate[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.hbs')) {
        const relPath = relative(templateDir, fullPath).replace(/\.hbs$/, '');
        const source = readFileSync(fullPath, 'utf-8');
        files.push({
          outputPath: relPath,
          template: Handlebars.compile(source),
        });
      }
    }
  }
  walk(templateDir);
  return files;
}

// ============================================================================
// Design Token Helpers
// ============================================================================

function designTokensToContext(tokens: DesignTokens): Record<string, string> {
  const radiusMap: Record<string, string> = {
    none: '0',
    small: '0.25rem',
    medium: '0.5rem',
    large: '0.75rem',
  };

  return {
    primaryHsl: hexToHsl(tokens.primaryColor),
    accentHsl: hexToHsl(tokens.accentColor),
    fontFamily: tokens.fontFamily,
    radius: radiusMap[tokens.borderRadius] ?? '0.5rem',
  };
}

function hexToHsl(hex: string): string {
  const { h, s, l } = colord(hex).toHsl();
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

// ============================================================================
// Template Execution
// ============================================================================

interface TemplateResult {
  files: GeneratedFile[];
  migration?: string;
  schema?: Partial<SchemaContract>;
  dependencies: Record<string, string>;
}

// Map EntityField types to SQL types
const ENTITY_TO_SQL_TYPE: Record<string, SQLType> = {
  text: 'text',
  number: 'numeric',
  boolean: 'boolean',
  enum: 'text',
  uuid: 'uuid',
  timestamp: 'timestamptz',
  json: 'jsonb',
};

/**
 * Build a TableDef from template config (for CRUD entities).
 * Returns null if config is invalid or missing required fields.
 */
function buildTableDefFromConfig(config: Record<string, unknown>): TableDef | null {
  const entity = config.entity as string | undefined;
  const tableName = config.tableName as string | undefined;
  const fields = config.fields as Array<{ name: string; type: string; required: boolean; enumValues?: string[] }> | undefined;
  const belongsTo = config.belongsTo as string[] | undefined;

  if (!entity || !tableName || !fields) return null;

  const columns: ColumnDef[] = [
    { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
  ];

  // Entity fields
  for (const field of fields) {
    columns.push({
      name: field.name,
      type: ENTITY_TO_SQL_TYPE[field.type] ?? 'text',
      nullable: !field.required,
      default: field.type === 'boolean' ? 'false' :
               field.type === 'json' ? "'{}'" : undefined,
    });
  }

  // belongsTo FK columns
  for (const relation of belongsTo ?? []) {
    columns.push({
      name: `${relation}_id`,
      type: 'uuid',
      nullable: false,
      references: { table: pluralizeTable(relation), column: 'id' },
    });
  }

  // user_id FK (all CRUD tables have it)
  columns.push({
    name: 'user_id',
    type: 'uuid',
    nullable: false,
    references: { table: 'auth.users', column: 'id' },
  });

  // Timestamps
  columns.push(
    { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
    { name: 'updated_at', type: 'timestamptz', nullable: false, default: 'now()' },
  );

  return {
    name: tableName,
    columns,
    rlsPolicies: [
      { name: `Users can view own ${tableName}`, operation: 'SELECT', using: 'auth.uid() = user_id' },
      { name: `Users can insert own ${tableName}`, operation: 'INSERT', withCheck: 'auth.uid() = user_id' },
      { name: `Users can update own ${tableName}`, operation: 'UPDATE', using: 'auth.uid() = user_id' },
      { name: `Users can delete own ${tableName}`, operation: 'DELETE', using: 'auth.uid() = user_id' },
    ],
  };
}

const TEMPLATE_LAYERS: Record<TemplateName, number> = {
  scaffold: 0,
  auth: 1,
  crud: 1,
  realtime: 2,
  dashboard: 2,
  messaging: 2,
};

export function executeTemplate(
  task: TemplateTask,
  designTokens: DesignTokens,
): TemplateResult {
  const templateDir = join(getTemplatesDir(), task.template);
  const templates = loadTemplateDir(templateDir);
  const layer = TEMPLATE_LAYERS[task.template] ?? 0;

  const context: Record<string, unknown> = {
    ...task.config,
    ...designTokensToContext(designTokens),
    appName: task.config.appName ?? 'App',
  };

  const files: GeneratedFile[] = [];
  let migration: string | undefined;
  let schema: Partial<SchemaContract> | undefined;

  // Build schema fragment from config (replaces .sql.hbs)
  if (task.template === 'crud') {
    const tableDef = buildTableDefFromConfig(task.config);
    if (tableDef) {
      schema = { tables: [tableDef] };
    }
  } else if (task.template === 'messaging') {
    schema = {
      tables: [{
        name: 'messages',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'content', type: 'text', nullable: false },
          { name: 'channel_id', type: 'text', nullable: false, default: "'default'" },
          { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
        rlsPolicies: [
          { name: 'Users can view messages', operation: 'SELECT', using: 'true' },
          { name: 'Authenticated users can send messages', operation: 'INSERT', withCheck: 'auth.uid() = user_id' },
        ],
      }],
    };
  }

  // Render non-SQL Handlebars templates
  for (const { outputPath, template } of templates) {
    const resolvedPath = Handlebars.compile(outputPath)(context);
    const content = template(context);

    // Skip .sql.hbs files if we built a schema fragment
    if (schema && (resolvedPath.endsWith('.sql') || resolvedPath === 'migration.sql')) {
      continue;
    }

    if (resolvedPath.endsWith('.sql') || resolvedPath === 'migration.sql') {
      migration = migration ? `${migration}\n\n-- ---\n\n${content}` : content;
    } else {
      files.push({ path: resolvedPath, content, layer });
    }
  }

  return { files, migration, schema, dependencies: {} };
}

export function groupByLayer(tasks: TemplateTask[]): TemplateTask[][] {
  const groups: TemplateTask[][] = [];

  for (const task of tasks) {
    const layer = TEMPLATE_LAYERS[task.template] ?? 0;
    while (groups.length <= layer) groups.push([]);
    groups[layer].push(task);
  }

  return groups;
}
