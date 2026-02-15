# Agentic Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the template-based generation pipeline with a 9-agent Mastra `.network()` architecture that writes directly to Daytona sandboxes using deterministic tool chains.

**Architecture:** Supervisor agent routes to 8 specialist agents (Analyst, Infra, DBA, Backend, Frontend, Code Reviewer, QA, DevOps). SchemaContract remains the single source of truth. All agents use sandbox tools to read/write files and run commands. No Handlebars templates. Frontend agent composes from shadcn component registry. Deterministic chain: SchemaContract → Drizzle schema → SQL + types + validation.

**Tech Stack:** `@mastra/core@^1.4.0` (Agent, .network(), Memory), `@mastra/memory` (LibSQLStore), `@ai-sdk/openai` (model provider), `@daytonaio/sdk` (sandbox), `drizzle-orm@^0.38` (generated apps), `valibot@^1.0` (generated apps), `@tanstack/react-router@^1.x` (generated apps)

**Design doc:** `docs/plans/2026-02-14-agentic-pipeline-design.md`

**Branch:** `feature/mastra-agent-architecture`
**Worktree:** `.worktrees/mastra-agents`

---

## Task 1: contractToDrizzleSchema() — New Deterministic Generator

Generates Drizzle ORM `pgTable()` TypeScript source code from a `SchemaContract`. This replaces `contractToTypes()` for generated apps — instead of raw TypeScript interfaces, the Backend Engineer agent will write a Drizzle schema file that serves as the single source for SQL, types, AND validation schemas.

**Files:**
- Create: `lib/contract-to-drizzle.ts`
- Test: `tests/contract-to-drizzle.test.ts`
- Reference: `lib/schema-contract.ts` (read-only — SchemaContract type)
- Reference: `lib/contract-to-sql.ts` (read-only — pattern to follow)

**Step 1: Write the failing test**

```typescript
// tests/contract-to-drizzle.test.ts
import { describe, it, expect } from 'vitest';
import { contractToDrizzleSchema } from '@/lib/contract-to-drizzle';
import type { SchemaContract } from '@/lib/schema-contract';

describe('contractToDrizzleSchema', () => {
  const contract: SchemaContract = {
    tables: [
      {
        name: 'tasks',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'title', type: 'text', nullable: false },
          { name: 'completed', type: 'boolean', default: 'false' },
          { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
        rlsPolicies: [],
      },
    ],
    enums: [{ name: 'task_status', values: ['pending', 'in_progress', 'done'] }],
  };

  it('generates valid Drizzle pgTable imports', () => {
    const result = contractToDrizzleSchema(contract);
    expect(result).toContain("import { pgTable, pgEnum");
    expect(result).toContain("from 'drizzle-orm/pg-core'");
  });

  it('generates pgEnum for contract enums', () => {
    const result = contractToDrizzleSchema(contract);
    expect(result).toContain("export const taskStatusEnum = pgEnum('task_status', ['pending', 'in_progress', 'done'])");
  });

  it('generates pgTable with correct column types', () => {
    const result = contractToDrizzleSchema(contract);
    expect(result).toContain("export const tasks = pgTable('tasks'");
    expect(result).toContain("id: uuid('id').primaryKey().default(sql`gen_random_uuid()`)");
    expect(result).toContain("title: text('title').notNull()");
    expect(result).toContain("completed: boolean('completed').default(false)");
    expect(result).toContain("createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`)");
  });

  it('generates foreign key references', () => {
    const result = contractToDrizzleSchema(contract);
    // Drizzle FK uses .references() callback — but for external tables like auth.users,
    // we use raw SQL reference since auth.users isn't a Drizzle table
    expect(result).toContain("userId: uuid('user_id')");
  });

  it('generates type exports using $inferSelect and $inferInsert', () => {
    const result = contractToDrizzleSchema(contract);
    expect(result).toContain("export type Task = typeof tasks.$inferSelect");
    expect(result).toContain("export type NewTask = typeof tasks.$inferInsert");
  });

  it('handles multiple tables in topological order', () => {
    const multiTable: SchemaContract = {
      tables: [
        {
          name: 'comments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
            { name: 'body', type: 'text' },
          ],
        },
        {
          name: 'posts',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
        },
      ],
    };
    const result = contractToDrizzleSchema(multiTable);
    const postsIdx = result.indexOf("export const posts");
    const commentsIdx = result.indexOf("export const comments");
    expect(postsIdx).toBeLessThan(commentsIdx); // posts before comments (FK order)
  });

  it('generates auto-generated header comment', () => {
    const result = contractToDrizzleSchema(contract);
    expect(result).toContain('// Auto-generated by VibeStack');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && pnpm test -- tests/contract-to-drizzle.test.ts`
Expected: FAIL with "Cannot find module '@/lib/contract-to-drizzle'"

**Step 3: Write minimal implementation**

```typescript
// lib/contract-to-drizzle.ts
import type { SchemaContract, TableDef, ColumnDef } from './schema-contract';

/**
 * Column name conversion: snake_case → camelCase for Drizzle JS property names.
 * Drizzle convention: JS uses camelCase, SQL column name in string argument.
 */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Capitalize first letter for type name generation.
 * "tasks" → "Task", "user_profiles" → "UserProfile"
 */
function toTypeName(tableName: string): string {
  // Remove trailing 's' for singular, then PascalCase
  const singular = tableName.endsWith('s') ? tableName.slice(0, -1) : tableName;
  return singular
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/** Map SchemaContract SQL types → Drizzle column builder calls */
const DRIZZLE_TYPE_MAP: Record<string, { fn: string; import: string }> = {
  uuid: { fn: 'uuid', import: 'uuid' },
  text: { fn: 'text', import: 'text' },
  numeric: { fn: 'numeric', import: 'numeric' },
  boolean: { fn: 'boolean', import: 'boolean' },
  timestamptz: { fn: "timestamp", import: 'timestamp' },
  jsonb: { fn: 'jsonb', import: 'jsonb' },
  integer: { fn: 'integer', import: 'integer' },
  bigint: { fn: 'bigint', import: 'bigint' },
};

/**
 * Generate Drizzle ORM schema TypeScript source from a SchemaContract.
 *
 * The generated file is the single source of truth for:
 * - SQL migrations (via drizzle-kit generate)
 * - TypeScript types (via $inferSelect / $inferInsert)
 * - Validation schemas (via createSelectSchema / createInsertSchema)
 */
export function contractToDrizzleSchema(contract: SchemaContract): string {
  // Collect all needed Drizzle imports
  const imports = new Set<string>(['pgTable']);
  const needsSql = contract.tables.some(t =>
    t.columns.some(c => c.default && !['false', 'true'].includes(c.default))
  );
  const hasEnums = (contract.enums?.length ?? 0) > 0;

  if (hasEnums) imports.add('pgEnum');

  for (const table of contract.tables) {
    for (const col of table.columns) {
      const mapping = DRIZZLE_TYPE_MAP[col.type];
      if (mapping) imports.add(mapping.import);
    }
  }

  const lines: string[] = [
    '// Auto-generated by VibeStack — do not edit manually',
    '',
  ];

  // Import line
  const importList = Array.from(imports).sort().join(', ');
  lines.push(`import { ${importList} } from 'drizzle-orm/pg-core';`);
  if (needsSql) {
    lines.push("import { sql } from 'drizzle-orm';");
  }
  lines.push('');

  // Enums
  for (const e of contract.enums ?? []) {
    const camelName = snakeToCamel(e.name) + 'Enum';
    const values = e.values.map(v => `'${v}'`).join(', ');
    lines.push(`export const ${camelName} = pgEnum('${e.name}', [${values}]);`);
    lines.push('');
  }

  // Tables in topological order
  const sorted = topologicalSort(contract.tables);
  const tableNames = new Set(contract.tables.map(t => t.name));

  for (const table of sorted) {
    const camelTable = snakeToCamel(table.name);
    lines.push(`export const ${camelTable} = pgTable('${table.name}', {`);

    for (const col of table.columns) {
      lines.push(`  ${generateColumn(col, tableNames)},`);
    }

    lines.push('});');
    lines.push('');

    // Type exports
    const typeName = toTypeName(table.name);
    lines.push(`export type ${typeName} = typeof ${camelTable}.$inferSelect;`);
    lines.push(`export type New${typeName} = typeof ${camelTable}.$inferInsert;`);
    lines.push('');
  }

  return lines.join('\n');
}

function generateColumn(col: ColumnDef, tableNames: Set<string>): string {
  const mapping = DRIZZLE_TYPE_MAP[col.type];
  if (!mapping) throw new Error(`Unsupported column type: ${col.type}`);

  const camelName = snakeToCamel(col.name);
  let builder: string;

  if (col.type === 'timestamptz') {
    builder = `${camelName}: timestamp('${col.name}', { withTimezone: true })`;
  } else {
    builder = `${camelName}: ${mapping.fn}('${col.name}')`;
  }

  // Chain modifiers
  if (col.primaryKey) builder += '.primaryKey()';
  if (col.unique) builder += '.unique()';
  if (col.nullable === false && !col.primaryKey) builder += '.notNull()';

  if (col.default) {
    if (col.default === 'true' || col.default === 'false') {
      builder += `.default(${col.default})`;
    } else {
      builder += `.default(sql\`${col.default}\`)`;
    }
  }

  // FK references — only for tables in this schema (not auth.users)
  if (col.references && tableNames.has(col.references.table)) {
    const refTable = snakeToCamel(col.references.table);
    builder += `.references(() => ${refTable}.${snakeToCamel(col.references.column)})`;
  }

  return builder;
}

/**
 * Topological sort tables by FK dependencies (same algorithm as contract-to-sql.ts).
 */
function topologicalSort(tables: TableDef[]): TableDef[] {
  const tableMap = new Map(tables.map(t => [t.name, t]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const t of tables) {
    inDegree.set(t.name, 0);
    adj.set(t.name, []);
  }

  for (const t of tables) {
    for (const col of t.columns) {
      if (col.references && tableMap.has(col.references.table)) {
        adj.get(col.references.table)!.push(t.name);
        inDegree.set(t.name, (inDegree.get(t.name) ?? 0) + 1);
      }
    }
  }

  const queue = tables.filter(t => inDegree.get(t.name) === 0).map(t => t.name);
  const result: TableDef[] = [];

  while (queue.length > 0) {
    const name = queue.shift()!;
    result.push(tableMap.get(name)!);
    for (const neighbor of adj.get(name) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && pnpm test -- tests/contract-to-drizzle.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
git add lib/contract-to-drizzle.ts tests/contract-to-drizzle.test.ts
git commit -m "feat: add contractToDrizzleSchema() deterministic generator"
```

---

## Task 2: shadcn Component Manifest Generator

Generates a JSON manifest from `shadcn-registry/` that the Frontend Engineer agent receives as context. Maps component name → exports → props → import path. This replaces templates — the agent composes pages from these primitives.

**Files:**
- Create: `lib/shadcn-manifest.ts`
- Test: `tests/shadcn-manifest.test.ts`
- Reference: `shadcn-registry/_deps.json` (read-only — dependency metadata)
- Reference: `shadcn-registry/*.tsx` (read-only — component source files)

**Step 1: Write the failing test**

```typescript
// tests/shadcn-manifest.test.ts
import { describe, it, expect } from 'vitest';
import { generateShadcnManifest, type ComponentManifest } from '@/lib/shadcn-manifest';

describe('generateShadcnManifest', () => {
  it('returns a manifest with all registered components', () => {
    const manifest = generateShadcnManifest();
    expect(Object.keys(manifest).length).toBeGreaterThan(10);
    expect(manifest).toHaveProperty('button');
    expect(manifest).toHaveProperty('card');
    expect(manifest).toHaveProperty('input');
  });

  it('each component has import path, exports, and deps', () => {
    const manifest = generateShadcnManifest();
    const button = manifest['button'];
    expect(button.import).toBe('@/components/ui/button');
    expect(button.exports).toContain('Button');
    expect(button.deps).toBeDefined();
  });

  it('card has multiple exports', () => {
    const manifest = generateShadcnManifest();
    const card = manifest['card'];
    expect(card.exports).toContain('Card');
    expect(card.exports).toContain('CardHeader');
    expect(card.exports).toContain('CardTitle');
    expect(card.exports).toContain('CardContent');
  });

  it('serializes to JSON for agent context', () => {
    const manifest = generateShadcnManifest();
    const json = JSON.stringify(manifest);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && pnpm test -- tests/shadcn-manifest.test.ts`
Expected: FAIL

**Step 3: Write implementation**

The manifest generator reads `shadcn-registry/_deps.json` for dependency info and parses each `.tsx` file for exported component names. We use a simple regex for `export function` / `export const` patterns rather than a full TypeScript parser — good enough for our controlled registry files.

```typescript
// lib/shadcn-manifest.ts
import fs from 'node:fs';
import path from 'node:path';

export interface ComponentEntry {
  import: string;
  exports: string[];
  deps: Record<string, string>;
  requires?: string[];
}

export type ComponentManifest = Record<string, ComponentEntry>;

const REGISTRY_DIR = path.join(process.cwd(), 'shadcn-registry');
const DEPS_FILE = path.join(REGISTRY_DIR, '_deps.json');

/**
 * Extract exported names from a .tsx file using regex.
 * Handles: export function Foo, export const Foo, export { Foo }
 */
function extractExports(source: string): string[] {
  const exports: string[] = [];
  // export function ComponentName
  for (const match of source.matchAll(/export\s+function\s+([A-Z]\w+)/g)) {
    exports.push(match[1]);
  }
  // export const ComponentName
  for (const match of source.matchAll(/export\s+const\s+([A-Z]\w+)/g)) {
    exports.push(match[1]);
  }
  return exports;
}

/**
 * Generate a manifest of all shadcn components in the registry.
 * Used as context for the Frontend Engineer agent.
 */
export function generateShadcnManifest(): ComponentManifest {
  const depsData = JSON.parse(fs.readFileSync(DEPS_FILE, 'utf-8'));
  const manifest: ComponentManifest = {};

  const files = fs.readdirSync(REGISTRY_DIR).filter(f => f.endsWith('.tsx'));

  for (const file of files) {
    const name = path.basename(file, '.tsx');
    const source = fs.readFileSync(path.join(REGISTRY_DIR, file), 'utf-8');
    const exports = extractExports(source);
    const depEntry = depsData[name] ?? { deps: {} };

    manifest[name] = {
      import: `@/components/ui/${name}`,
      exports,
      deps: depEntry.deps ?? {},
      ...(depEntry.requires ? { requires: depEntry.requires } : {}),
    };
  }

  return manifest;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && pnpm test -- tests/shadcn-manifest.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
git add lib/shadcn-manifest.ts tests/shadcn-manifest.test.ts
git commit -m "feat: add shadcn component manifest generator for agent context"
```

---

## Task 3: Expand Sandbox Tools (4 → 14+ tools)

Expand the sandbox tool set following the official Daytona/Mastra coding agent pattern. Tools use `sandboxId` as a parameter (not closure-bound). Each tool is a standalone `createTool()` that the Mastra framework can bind to agents.

**Important API detail:** `createTool` execute signature is `async (inputData, context)` — two separate params. The `inputData` is the validated Zod input. The `context` provides `agent.suspend()`, `agent.resumeData`, etc.

**Files:**
- Rewrite: `lib/agents/tools.ts` (116 lines → ~400 lines)
- Test: `tests/agent-tools.test.ts` (new)
- Reference: https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/ (tool patterns)

**Step 1: Write the failing test**

```typescript
// tests/agent-tools.test.ts
import { describe, it, expect } from 'vitest';
import {
  writeFileTool,
  readFileTool,
  listFilesTool,
  createDirectoryTool,
  runCommandTool,
  runBuildTool,
  runLintTool,
  runTypeCheckTool,
  validateSQLTool,
  getPreviewUrlTool,
  createSandboxTool,
  pushToGitHubTool,
  deployToVercelTool,
  searchDocsTool,
} from '@/lib/agents/tools';

describe('Sandbox Tools', () => {
  it('exports all 14 tools', () => {
    const tools = [
      writeFileTool, readFileTool, listFilesTool, createDirectoryTool,
      runCommandTool, runBuildTool, runLintTool, runTypeCheckTool,
      validateSQLTool, getPreviewUrlTool, createSandboxTool,
      pushToGitHubTool, deployToVercelTool, searchDocsTool,
    ];
    for (const tool of tools) {
      expect(tool).toBeDefined();
      expect(tool.id).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('writeFileTool has correct input schema', () => {
    const schema = writeFileTool.inputSchema;
    const valid = schema.safeParse({ sandboxId: 'abc', path: 'src/App.tsx', content: 'hello' });
    expect(valid.success).toBe(true);
  });

  it('readFileTool has correct input schema', () => {
    const schema = readFileTool.inputSchema;
    const valid = schema.safeParse({ sandboxId: 'abc', path: 'src/App.tsx' });
    expect(valid.success).toBe(true);
  });

  it('runCommandTool has correct input schema', () => {
    const schema = runCommandTool.inputSchema;
    const valid = schema.safeParse({ sandboxId: 'abc', command: 'bun run build' });
    expect(valid.success).toBe(true);
  });

  it('validateSQLTool input accepts SQL string', () => {
    const schema = validateSQLTool.inputSchema;
    const valid = schema.safeParse({ sql: 'CREATE TABLE test (id uuid PRIMARY KEY);' });
    expect(valid.success).toBe(true);
  });

  it('searchDocsTool input accepts library and query', () => {
    const schema = searchDocsTool.inputSchema;
    const valid = schema.safeParse({ library: 'react', query: 'useEffect cleanup' });
    expect(valid.success).toBe(true);
  });

  it('tools that require sandboxId reject missing sandboxId', () => {
    const schema = writeFileTool.inputSchema;
    const invalid = schema.safeParse({ path: 'src/App.tsx', content: 'hello' });
    expect(invalid.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && pnpm test -- tests/agent-tools.test.ts`
Expected: FAIL (current tools.ts exports createSandboxTools factory, not individual tools)

**Step 3: Rewrite lib/agents/tools.ts**

Rewrite the file with 14 standalone tools. Each tool that needs sandbox access takes `sandboxId` as an input parameter and resolves the sandbox via `Daytona.get()`. Tools that don't need sandbox (validateSQL, searchDocs) are standalone.

Key tools by agent:

| Tool | Used By |
|------|---------|
| `writeFileTool` | DBA, Backend, Frontend |
| `readFileTool` | DBA, Backend, Frontend, Code Reviewer, QA |
| `listFilesTool` | Backend, Frontend, Code Reviewer, QA |
| `createDirectoryTool` | Backend, Frontend |
| `runCommandTool` | Infra, DBA, QA, DevOps |
| `runBuildTool` | QA |
| `runLintTool` | QA |
| `runTypeCheckTool` | QA |
| `validateSQLTool` | QA |
| `getPreviewUrlTool` | Infra |
| `createSandboxTool` | Infra |
| `pushToGitHubTool` | DevOps |
| `deployToVercelTool` | DevOps |
| `searchDocsTool` | Analyst, DBA, Backend, Frontend |

**Implementation pattern** (each tool follows this structure):

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Daytona } from '@daytonaio/sdk';

const daytona = new Daytona();

export const writeFileTool = createTool({
  id: 'write-file',
  description: 'Write a file to the sandbox workspace',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    path: z.string().describe('File path relative to /workspace'),
    content: z.string().describe('File content to write'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    bytesWritten: z.number(),
  }),
  execute: async (inputData) => {
    const sandbox = await daytona.get(inputData.sandboxId);
    const fullPath = `/workspace/${inputData.path}`;
    await sandbox.fs.uploadFile(Buffer.from(inputData.content), fullPath);
    return {
      success: true,
      path: inputData.path,
      bytesWritten: inputData.content.length,
    };
  },
});
```

Follow this pattern for all 14 tools. For `validateSQLTool`, use PGlite inline (no sandbox needed). For `searchDocsTool`, use the context7 MCP tool pattern (resolve library ID, then query docs).

**Step 4: Run test to verify it passes**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && pnpm test -- tests/agent-tools.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
git add lib/agents/tools.ts tests/agent-tools.test.ts
git commit -m "feat: expand sandbox tools from 4 to 14 for agent architecture"
```

---

## Task 4: Update Agent Schemas for 9-Agent Architecture

Update `lib/agents/schemas.ts` to support the new agent outputs. Keep existing schemas that are still valid (ClarifiedRequirements, DatabaseSchemaArtifact). Add new schemas for agents that didn't exist before.

**Files:**
- Modify: `lib/agents/schemas.ts` (206 lines)
- Modify: `tests/agent-schemas.test.ts` (104 lines)

**Step 1: Write the failing tests**

Add tests for new schemas to `tests/agent-schemas.test.ts`:

```typescript
// Add to existing test file
import {
  // Existing (keep)
  ClarifiedRequirementsSchema,
  DatabaseSchemaArtifactSchema,
  FrontendArtifactSchema,
  QAResultArtifactSchema,
  AgentEventSchema,
  // New
  InfraProvisionResultSchema,
  CodeReviewResultSchema,
  DeploymentResultSchema,
} from '@/lib/agents/schemas';

describe('InfraProvisionResultSchema', () => {
  it('validates sandbox + supabase provision result', () => {
    const valid = {
      sandboxId: 'sandbox-123',
      previewUrl: 'https://preview.daytona.io/abc',
      supabaseProjectId: 'proj-456',
      supabaseUrl: 'https://abc.supabase.co',
      supabaseAnonKey: 'eyJ...',
    };
    expect(InfraProvisionResultSchema.safeParse(valid).success).toBe(true);
  });
});

describe('CodeReviewResultSchema', () => {
  it('validates review with issues', () => {
    const valid = {
      filesReviewed: ['src/App.tsx', 'src/lib/hooks.ts'],
      issues: [
        { file: 'src/App.tsx', line: 15, severity: 'warning', message: 'Unused import' },
      ],
      passed: false,
    };
    expect(CodeReviewResultSchema.safeParse(valid).success).toBe(true);
  });
});

describe('DeploymentResultSchema', () => {
  it('validates successful deployment', () => {
    const valid = {
      repoUrl: 'https://github.com/VibeStackCodes-Generated/my-app',
      deploymentUrl: 'https://my-app.vercel.app',
      deploymentId: 'dpl-123',
      status: 'success',
    };
    expect(DeploymentResultSchema.safeParse(valid).success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && pnpm test -- tests/agent-schemas.test.ts`
Expected: FAIL (new schemas don't exist yet)

**Step 3: Add new schemas to lib/agents/schemas.ts**

Add `InfraProvisionResultSchema`, `CodeReviewResultSchema`, `DeploymentResultSchema` to the existing file. Keep all existing schemas unchanged.

**Step 4: Run test to verify it passes**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && pnpm test -- tests/agent-schemas.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
git add lib/agents/schemas.ts tests/agent-schemas.test.ts
git commit -m "feat: add schemas for infra, code review, and deployment agents"
```

---

## Task 5: Rewrite Agent Registry — 9 Agents + Supervisor Network

This is the core task. Rewrite `lib/agents/registry.ts` from 4 agents using `createWorkflow` to 9 agents using `.network()`. The Supervisor agent has all 8 specialists as sub-agents. Memory is configured with LibSQLStore for observational context.

**Files:**
- Rewrite: `lib/agents/registry.ts` (141 lines → ~350 lines)
- Rewrite: `tests/agent-registry.test.ts`
- Reference: Design doc section "The Agent Team (9 Agents)"
- Reference: Mastra API — Agent constructor, Memory, .network()

**Key API signatures** (from research):

```typescript
// Agent with sub-agents for .network()
const supervisor = new Agent({
  id: 'supervisor',
  name: 'Supervisor',
  model: 'openai/gpt-5.2',       // model router string
  instructions: '...',
  agents: { analyst, infra, dba, backend, frontend, reviewer, qa, devops },
  memory: new Memory({
    storage: new LibSQLStore({ id: 'mastra-store', url: 'file:./memory/mastra.db' }),
  }),
});

// Sub-agent (no sub-agents of its own)
const analyst = new Agent({
  id: 'analyst',
  name: 'Analyst',
  description: 'Converses with users, extracts requirements',  // helps supervisor route
  model: 'openai/gpt-5.2',
  instructions: '...',
  tools: { searchDocs: searchDocsTool },
});
```

**Step 1: Write the failing test**

```typescript
// tests/agent-registry.test.ts (rewrite)
import { describe, it, expect } from 'vitest';
import {
  mastra,
  supervisorAgent,
  analystAgent,
  infraAgent,
  dbaAgent,
  backendAgent,
  frontendAgent,
  reviewerAgent,
  qaAgent,
  devOpsAgent,
} from '@/lib/agents/registry';

describe('Agent Registry', () => {
  it('exports Mastra instance', () => {
    expect(mastra).toBeDefined();
  });

  it('exports all 9 agents', () => {
    const agents = [
      supervisorAgent, analystAgent, infraAgent, dbaAgent,
      backendAgent, frontendAgent, reviewerAgent, qaAgent, devOpsAgent,
    ];
    expect(agents).toHaveLength(9);
    agents.forEach(a => expect(a).toBeDefined());
  });

  it('supervisor uses ORCHESTRATOR model', () => {
    expect(supervisorAgent.model).toContain('gpt-5.2');
  });

  it('backend and frontend use CODEGEN model', () => {
    expect(backendAgent.model).toContain('gpt-5.1-codex-max');
    expect(frontendAgent.model).toContain('gpt-5.1-codex-max');
  });

  it('infra, qa, devops use VALIDATOR model', () => {
    expect(infraAgent.model).toContain('gpt-5-mini');
    expect(qaAgent.model).toContain('gpt-5-mini');
    expect(devOpsAgent.model).toContain('gpt-5-mini');
  });

  it('supervisor has all 8 sub-agents registered', () => {
    // Supervisor should have agents property with 8 entries
    expect(Object.keys(supervisorAgent.agents ?? {})).toHaveLength(8);
  });

  it('supervisor has memory configured', () => {
    expect(supervisorAgent.memory).toBeDefined();
  });

  it('Mastra instance registers the supervisor', () => {
    const agent = mastra.getAgent('supervisorAgent');
    expect(agent).toBeDefined();
  });

  it('each sub-agent has a description for routing', () => {
    const subAgents = [analystAgent, infraAgent, dbaAgent, backendAgent,
      frontendAgent, reviewerAgent, qaAgent, devOpsAgent];
    for (const agent of subAgents) {
      expect(agent.description).toBeDefined();
      expect(agent.description!.length).toBeGreaterThan(10);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && pnpm test -- tests/agent-registry.test.ts`
Expected: FAIL (old registry exports 4 agents, not 9)

**Step 3: Rewrite lib/agents/registry.ts**

Write all 9 agent definitions with:
- Correct model tier assignments
- Tool assignments per agent (from design doc table)
- Rich system instructions for each agent
- The supervisor with `agents` record and `memory`
- `description` field on all sub-agents (for routing decisions)

Model routing:
```typescript
const ORCHESTRATOR_MODEL = 'openai/gpt-5.2';
const CODEGEN_MODEL = 'openai/gpt-5.1-codex-max';
const VALIDATOR_MODEL = 'openai/gpt-5-mini';
```

Import tools from `./tools` and assign per the design doc table. Import Memory from `@mastra/memory` and LibSQLStore from `@mastra/libsql`.

**Step 4: Run test to verify it passes**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && pnpm test -- tests/agent-registry.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
git add lib/agents/registry.ts tests/agent-registry.test.ts
git commit -m "feat: rewrite registry with 9 agents and supervisor network"
```

---

## Task 6: Unified Agent Route (SSE)

Create `app/api/agent/route.ts` — the single endpoint that replaces both chat and generate routes. Uses `supervisorAgent.network()` to stream chunks, bridges them to SSE events.

**Files:**
- Create: `app/api/agent/route.ts`
- Reference: `lib/sse.ts` (read-only — SSE streaming utility)
- Reference: Design doc section "SSE Streaming"

**Key API** (from research):

```typescript
const result = await supervisorAgent.network(message, {
  memory: { thread: projectId, resource: userId },
});

// result.stream is AsyncIterable<{ type: string, payload: ... }>
for await (const chunk of result) {
  // Bridge to SSE events
}
```

**Step 1: Write implementation**

```typescript
// app/api/agent/route.ts
import { NextRequest } from 'next/server';
import { createSSEStream } from '@/lib/sse';
import type { StreamEvent } from '@/lib/types';
import { supervisorAgent } from '@/lib/agents/registry';
import { createClient } from '@/lib/supabase-server';

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { message, projectId } = body;

  if (!message || !projectId) {
    return new Response(JSON.stringify({ error: 'Missing message or projectId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Auth check (skip in mock mode)
  let userId = 'mock-user';
  if (!MOCK_MODE) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    userId = user.id;
  }

  return createSSEStream(async (emit: (event: StreamEvent) => void) => {
    try {
      emit({ type: 'stage_update', stage: 'generating' });

      const result = await supervisorAgent.network(message, {
        memory: {
          thread: projectId,
          resource: userId,
        },
      });

      for await (const chunk of result) {
        // Bridge Mastra network chunks to our SSE StreamEvent types
        switch (chunk.type) {
          case 'agent-execution-start':
            emit({
              type: 'agent_start',
              agentId: chunk.payload?.agentId ?? 'unknown',
              agentName: chunk.payload?.agentName ?? 'Agent',
              phase: 0,
            });
            break;

          case 'agent-execution-event-text-delta':
            emit({
              type: 'text_delta',
              delta: chunk.payload?.textDelta ?? '',
            });
            break;

          case 'agent-execution-end':
            emit({
              type: 'agent_complete',
              agentId: chunk.payload?.agentId ?? 'unknown',
              agentName: chunk.payload?.agentName ?? 'Agent',
              phase: 0,
            });
            break;

          case 'tool-execution-end':
            if (chunk.payload?.toolName === 'write-file') {
              emit({
                type: 'file_complete',
                path: chunk.payload?.result?.path ?? '',
                linesOfCode: chunk.payload?.result?.bytesWritten ?? 0,
              });
            }
            break;

          case 'network-execution-event-step-finish':
            emit({
              type: 'checkpoint',
              label: 'Network step complete',
              status: 'complete',
            });
            break;

          case 'workflow-execution-suspended':
            // Human-in-the-loop: plan approval
            emit({
              type: 'plan_approval',
              plan: chunk.payload?.suspendPayload,
            });
            break;
        }
      }

      emit({ type: 'stage_update', stage: 'complete' });
    } catch (error) {
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : 'Agent pipeline failed',
        stage: 'error',
      });
    }
  });
}
```

**Step 2: Verify types compile**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && npx tsc --noEmit --skipLibCheck`
Expected: No new errors from our route file

**Step 3: Commit**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
git add app/api/agent/route.ts
git commit -m "feat: add unified agent route with network SSE streaming"
```

---

## Task 7: Delete Old Pipeline Code

Remove all files replaced by the agent architecture. This is the "breaking" change — after this commit, the old v1 pipeline no longer exists on this branch.

**Files to delete:**
- `app/api/chat/route.ts` (147 lines)
- `app/api/chat/messages/route.ts` (62 lines)
- `app/api/projects/generate/route.ts` (288 lines)
- `app/api/projects/generate-v2/route.ts` (60 lines)
- `lib/template-pipeline.ts` (156 lines)
- `lib/template-registry.ts` (170 lines)
- `lib/feature-classifier.ts` (66 lines)
- `lib/verifier.ts` (568 lines)
- `lib/chat-tools.ts` (78 lines)
- `lib/generator.ts` (433 lines)
- `lib/agents/workflow.ts` (198 lines)
- `templates/` (entire directory — 27 files)

**Files to keep** (verify they have no imports from deleted files):
- `lib/schema-contract.ts` — no imports from deleted files
- `lib/contract-to-sql.ts` — imports only from schema-contract
- `lib/contract-to-types.ts` — imports only from schema-contract
- `lib/contract-to-drizzle.ts` — imports only from schema-contract (new in Task 1)
- `lib/sandbox.ts` — imports from @daytonaio/sdk only
- `lib/github.ts` — imports from octokit only
- `lib/sse.ts` — imports from types only

**Step 1: Delete files**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents

# Old routes
rm app/api/chat/route.ts
rm app/api/chat/messages/route.ts
rm app/api/projects/generate/route.ts
rm app/api/projects/generate-v2/route.ts

# Old pipeline modules
rm lib/template-pipeline.ts
rm lib/template-registry.ts
rm lib/feature-classifier.ts
rm lib/verifier.ts
rm lib/chat-tools.ts
rm lib/generator.ts

# Old workflow (replaced by .network())
rm lib/agents/workflow.ts

# Templates (replaced by shadcn manifest + agent composition)
rm -rf templates/
```

**Step 2: Update barrel exports in lib/agents/index.ts**

Remove the `workflow.ts` export, add new exports:

```typescript
// lib/agents/index.ts
export * from './schemas';
export {
  mastra,
  supervisorAgent,
  analystAgent,
  infraAgent,
  dbaAgent,
  backendAgent,
  frontendAgent,
  reviewerAgent,
  qaAgent,
  devOpsAgent,
} from './registry';
export * from './tools';
```

**Step 3: Clean up any remaining imports**

Search for imports from deleted modules:
```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
grep -r "template-pipeline\|template-registry\|feature-classifier\|verifier\|chat-tools\|generator\|workflow" --include="*.ts" --include="*.tsx" lib/ app/ components/ | grep -v node_modules | grep -v ".test."
```

Fix any remaining imports. Common ones:
- `lib/types.ts` may import types used by deleted modules — keep the types, remove any re-exports
- `app/` route files that import from deleted modules are already deleted

**Step 4: Verify build**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents && npx tsc --noEmit --skipLibCheck`
Expected: Clean (no errors from our changes)

**Step 5: Commit**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
git add -A
git commit -m "refactor: remove template pipeline, old routes, and workflow DAG

Deleted 12 files and templates/ directory (~2,200 lines).
Replaced by 9-agent .network() architecture in Tasks 1-6."
```

---

## Task 8: Update Generated App Snapshot Dependencies

Update `snapshot/package-base.json` with the new dependency set for generated Vite + React apps: Drizzle ORM (replaces Kysely), Valibot (replaces Zod), TanStack Router (replaces React Router).

**Files:**
- Modify: `snapshot/package-base.json`

**Step 1: Update package-base.json**

```json
{
  "name": "vibestack-workspace",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 3000",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-router": "^1.0.0",
    "@supabase/supabase-js": "^2.95.0",
    "drizzle-orm": "^0.38.0",
    "valibot": "^1.0.0",
    "@sentry/react": "^9.0.0",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.0",
    "class-variance-authority": "^0.7.1",
    "radix-ui": "^1.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.7.0",
    "vite": "8.0.0-beta.14",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/vite": "^4.1.0",
    "@tanstack/router-plugin": "^1.0.0",
    "drizzle-kit": "^0.30.0",
    "@biomejs/biome": "^1.9.0"
  }
}
```

**Changes from current:**
- Added: `@tanstack/react-router`, `@tanstack/router-plugin`, `drizzle-orm`, `drizzle-kit`, `valibot`, `@sentry/react`, `@biomejs/biome`
- Removed: `react-router`, `zod`, `@electric-sql/pglite` (PGlite stays in platform, not generated app)

**Step 2: Commit**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
git add snapshot/package-base.json
git commit -m "feat: update generated app deps (Drizzle, Valibot, TanStack Router)"
```

---

## Task 9: Install Platform Dependencies

Install new platform-level dependencies needed for the agent architecture.

**Step 1: Install @mastra/memory and @mastra/libsql**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
pnpm add @mastra/memory @mastra/libsql @upstash/ratelimit
```

These are needed by:
- `@mastra/memory` — Memory class for supervisor agent
- `@mastra/libsql` — LibSQLStore for memory persistence
- `@upstash/ratelimit` — Rate limiting on agent route

**Step 2: Verify installation**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
pnpm ls @mastra/memory @mastra/libsql @upstash/ratelimit
```

**Step 3: Commit**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
git add package.json pnpm-lock.yaml
git commit -m "chore: add @mastra/memory, @mastra/libsql, @upstash/ratelimit"
```

---

## Task 10: Full Build Verification + Final Cleanup

Run the complete test suite, type-check, and lint to verify everything works together.

**Step 1: Run all tests**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
pnpm test
```

Expected: All agent tests pass. Pre-existing test failures (not related to our changes) are acceptable.

**Step 2: Type check**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
npx tsc --noEmit --skipLibCheck
```

Expected: Clean

**Step 3: Lint**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
pnpm lint
```

Expected: No new lint errors in our files

**Step 4: Fix any issues found**

If there are type errors or lint issues in our new files, fix them. Do NOT fix pre-existing issues in files we didn't modify.

**Step 5: Final commit (if fixes needed)**

```bash
cd /Users/ammishra/VibeStack/platform/.worktrees/mastra-agents
git add -A
git commit -m "fix: resolve build issues from agent architecture overhaul"
```

---

## Dependency Graph

```
Task 1 (contractToDrizzle) ─────────────────────────────┐
Task 2 (shadcn manifest)   ─────────────────────────────┤
Task 8 (snapshot deps)     ──────────────────────────┐   │
Task 9 (platform deps)     ─────────────┐           │   │
                                        v           v   v
Task 3 (expand tools)      ──────────> Task 5 ──> Task 7 (delete old)
Task 4 (update schemas)    ──────────> (registry)    │
                                        │           │
                                        v           v
                                   Task 6 ──> Task 10 (verify)
                                 (agent route)
```

**Parallelizable:** Tasks 1, 2, 8, 9 are fully independent. Tasks 3 and 4 are independent of each other.

---

## Quick Reference: Mastra API Cheat Sheet

```typescript
// Agent with sub-agents (for .network())
const agent = new Agent({
  id: 'supervisor',
  model: 'openai/gpt-5.2',        // model router string
  instructions: '...',
  agents: { a1, a2, a3 },          // Record<string, Agent>
  memory: new Memory({ storage }), // REQUIRED for .network()
  description: '...',              // helps parent route to this agent
});

// .network() returns stream + promises
const result = await agent.network(message, {
  memory: { thread: projectId, resource: userId },
});
for await (const chunk of result) { /* chunk.type, chunk.payload */ }

// createTool
const tool = createTool({
  id: 'tool-name',
  inputSchema: z.object({ ... }),
  execute: async (inputData, context) => { ... },
});

// Memory
new Memory({
  storage: new LibSQLStore({ id: 'store', url: 'file:./mastra.db' }),
  options: { lastMessages: 40, semanticRecall: false },
});

// Mastra instance
const mastra = new Mastra({
  agents: { supervisorAgent },
  storage: new LibSQLStore({ id: 'storage', url: ':memory:' }),
});
```
