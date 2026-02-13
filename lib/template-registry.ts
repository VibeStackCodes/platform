import Handlebars from 'handlebars';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import type { TemplateTask, DesignTokens, GeneratedFile, TemplateName } from './types';

// ============================================================================
// Handlebars Helpers
// ============================================================================

Handlebars.registerHelper('pascalCase', (str: string) =>
  str.replace(/(^|[-_ ])(\w)/g, (_, __, c) => c.toUpperCase())
);

Handlebars.registerHelper('camelCase', (str: string) => {
  const pascal = str.replace(/(^|[-_ ])(\w)/g, (_, __, c) => c.toUpperCase());
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
});

Handlebars.registerHelper('pluralize', (str: string) => {
  if (str.endsWith('s')) return str + 'es';
  if (str.endsWith('y') && !/[aeiou]y$/.test(str)) return str.slice(0, -1) + 'ies';
  return str + 's';
});

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
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 50%';

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
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
