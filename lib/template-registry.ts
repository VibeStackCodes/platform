import Handlebars from 'handlebars';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { pascalCase, camelCase } from 'change-case';
import type { TemplateTask, DesignTokens, GeneratedFile, TemplateName } from './types';
import { pluralizeTable } from './utils';
import { colord } from 'colord';

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
  dependencies: Record<string, string>;
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

  for (const { outputPath, template } of templates) {
    const resolvedPath = Handlebars.compile(outputPath)(context);
    const content = template(context);

    if (resolvedPath.endsWith('.sql') || resolvedPath === 'migration.sql') {
      migration = migration ? `${migration}\n\n-- ---\n\n${content}` : content;
    } else {
      files.push({ path: resolvedPath, content, layer });
    }
  }

  return { files, migration, dependencies: {} };
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
