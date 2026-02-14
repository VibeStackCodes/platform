import type { Sandbox } from '@daytonaio/sdk';
import type { ChatPlan, StreamEvent, GeneratedFile } from './types';
import type { SchemaContract, TableDef, EnumDef, SeedRow } from './schema-contract';
import { faker } from '@faker-js/faker';
import { generateAllSeedData } from './seed-generator';
import { classifyFeatures } from './feature-classifier';
import { executeTemplate, groupByLayer } from './template-registry';
import { uploadFile, runCommand } from './sandbox';
import { installShadcnComponents } from './shadcn-installer';

/**
 * Template Pipeline
 *
 * Replaces the LLM-driven generator for the core app scaffold.
 * 1. Classify features → template tasks
 * 2. Execute templates by layer (deterministic, no LLM)
 * 3. Assemble: concat migrations, merge deps, write to sandbox
 */

const LAYER_LABELS: Record<number, string> = {
  0: 'scaffold and config',
  1: 'auth and data models',
  2: 'features and UI',
};

interface ScaffoldPhaseResult {
  scaffoldFiles: GeneratedFile[];
  featureFiles: GeneratedFile[];
  allDeps: Record<string, string>;
  allMigrations: string[];
  schemaContract: SchemaContract | null;
}

/**
 * Scaffold Phase: Execute all templates, separate layer 0 (scaffold) from feature files.
 * Writes only layer 0 files + installs dependencies.
 */
export async function runScaffoldPhase(
  chatPlan: ChatPlan,
  sandbox: Sandbox,
  emit: (event: StreamEvent) => void
): Promise<ScaffoldPhaseResult> {
  // 1. Classify features → template tasks
  const tasks = classifyFeatures(chatPlan.features);
  console.log(`[pipeline] Classified ${chatPlan.features.length} features → ${tasks.length} template tasks`);

  // 2. Execute templates by layer
  const allFiles: GeneratedFile[] = [];
  const allMigrations: string[] = [];
  const allDeps: Record<string, string> = {};
  const schemaFragments: Partial<SchemaContract>[] = [];
  const layerGroups = groupByLayer(tasks);

  for (let layerIdx = 0; layerIdx < layerGroups.length; layerIdx++) {
    const layerTasks = layerGroups[layerIdx];
    const layerLabel = LAYER_LABELS[layerIdx] ?? `layer ${layerIdx}`;

    emit({
      type: 'checkpoint',
      label: `Layer ${layerIdx}: ${layerLabel}`,
      status: 'active',
    });

    console.log(`[pipeline] Layer ${layerIdx}: ${layerTasks.length} templates`);

    const results = await Promise.all(
      layerTasks.map(task => executeTemplate(task, chatPlan.designTokens))
    );

    for (const result of results) {
      allFiles.push(...result.files);
      if (result.migration) allMigrations.push(result.migration);
      if (result.schema) schemaFragments.push(result.schema);
      Object.assign(allDeps, result.dependencies);
    }

    emit({
      type: 'checkpoint',
      label: `Layer ${layerIdx}: ${layerLabel}`,
      status: 'complete',
    });
  }

  // Merge schema fragments
  const schemaContract = schemaFragments.length > 0
    ? mergeSchemaContracts(schemaFragments)
    : null;

  // 2.5. Install shadcn components (after scaffold, before file write)
  if (chatPlan.shadcnComponents && chatPlan.shadcnComponents.length > 0) {
    emit({ type: 'checkpoint', label: 'Installing UI components', status: 'active' });

    const shadcn = installShadcnComponents(chatPlan.shadcnComponents);
    allFiles.push(...shadcn.files);
    Object.assign(allDeps, shadcn.deps);

    emit({ type: 'checkpoint', label: `Installing UI components (${shadcn.files.length})`, status: 'complete' });
  }

  // 3. Write migration file (concat all migrations)
  if (allMigrations.length > 0) {
    const migrationContent = allMigrations.join('\n\n-- ---\n\n');
    const migrationFile: GeneratedFile = {
      path: 'supabase/migrations/001_init.sql',
      content: migrationContent,
      layer: 0,
    };
    allFiles.push(migrationFile);
  }

  // 4. Separate scaffold files (layer 0) from feature files (layer 1+)
  const scaffoldFiles = allFiles.filter(f => f.layer === 0);
  const featureFiles = allFiles.filter(f => f.layer > 0);

  // 5. Write scaffold files only
  emit({ type: 'stage_update', stage: 'generating' });

  for (const file of scaffoldFiles) {
    emit({ type: 'file_start', path: file.path, layer: file.layer });

    await uploadFile(sandbox, file.content, `/workspace/${file.path}`);

    const linesOfCode = file.content.split('\n').length;
    emit({ type: 'file_chunk', path: file.path, chunk: file.content });
    emit({ type: 'file_complete', path: file.path, linesOfCode });

    console.log(`[pipeline] ✓ ${file.path} (${linesOfCode} lines)`);
  }

  // 6. Install dependencies
  if (Object.keys(allDeps).length > 0) {
    emit({ type: 'checkpoint', label: 'Installing dependencies', status: 'active' });

    const depsList = Object.entries(allDeps)
      .map(([pkg, ver]) => `${pkg}@${ver}`)
      .join(' ');

    try {
      await runCommand(
        sandbox,
        `cd /workspace && bun install ${depsList}`,
        'bun-install',
        { cwd: '/workspace', timeout: 120 }
      );
    } catch (error) {
      throw new Error(`Dependency installation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    emit({ type: 'checkpoint', label: 'Installing dependencies', status: 'complete' });
  }

  // 7. Init git repo
  try {
    await runCommand(
      sandbox,
      'git init && git config user.email "vibestack@generated.app" && git config user.name "VibeStack"',
      'git-init',
      { cwd: '/workspace', timeout: 30 }
    );
  } catch (error) {
    throw new Error(`Git init failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`[pipeline] ✓ Scaffold phase complete: ${scaffoldFiles.length} files written, ${featureFiles.length} feature files pending`);

  return {
    scaffoldFiles,
    featureFiles,
    allDeps,
    allMigrations,
    schemaContract,
  };
}

/**
 * Feature Phase: Write feature files (layer 1+) one by one, triggering HMR.
 * Returns all generated file contents (scaffold + features).
 */
export async function runFeaturePhase(
  featureFiles: GeneratedFile[],
  scaffoldFiles: GeneratedFile[],
  sandbox: Sandbox,
  emit: (event: StreamEvent) => void,
  liveFixer?: { markFileWritten(path: string, content: string): void } | null,
): Promise<Map<string, string>> {
  const generatedContents = new Map<string, string>();

  // Add scaffold files to contents map
  for (const file of scaffoldFiles) {
    generatedContents.set(file.path, file.content);
  }

  // Write feature files one by one (triggers HMR)
  for (const file of featureFiles) {
    emit({ type: 'file_start', path: file.path, layer: file.layer });

    await uploadFile(sandbox, file.content, `/workspace/${file.path}`);
    generatedContents.set(file.path, file.content);
    liveFixer?.markFileWritten(file.path, file.content);

    const linesOfCode = file.content.split('\n').length;
    emit({ type: 'file_chunk', path: file.path, chunk: file.content });
    emit({ type: 'file_complete', path: file.path, linesOfCode });

    console.log(`[pipeline] ✓ ${file.path} (${linesOfCode} lines)`);
  }

  // Commit all files (scaffold + features)
  try {
    await sandbox.git.add('/workspace', ['.']);
    const commitResponse = await sandbox.git.commit(
      '/workspace',
      'feat: generate app from templates',
      'VibeStack',
      'vibestack@generated.app',
    );
    const hash = commitResponse.sha?.slice(0, 7) || 'unknown';

    const allFiles = [...scaffoldFiles, ...featureFiles];
    emit({
      type: 'layer_commit',
      layer: 0,
      hash,
      message: 'feat: generate app from templates',
      files: allFiles.map(f => f.path),
    });
  } catch (error) {
    throw new Error(`Git commit failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`[pipeline] ✓ Feature phase complete: ${featureFiles.length} files written`);
  return generatedContents;
}

/**
 * Merge multiple partial SchemaContract fragments into a single contract.
 * Deduplicates tables by name (last occurrence wins).
 * Merges enums by name (last occurrence wins).
 * Concatenates seedData.
 */
export function mergeSchemaContracts(
  fragments: Partial<SchemaContract>[],
): SchemaContract {
  const tableMap = new Map<string, TableDef>();
  const enumMap = new Map<string, EnumDef>();
  const seedData: SeedRow[] = [];

  for (const fragment of fragments) {
    for (const table of fragment.tables ?? []) {
      tableMap.set(table.name, table);
    }
    for (const e of fragment.enums ?? []) {
      enumMap.set(e.name, e);
    }
    seedData.push(...(fragment.seedData ?? []));
  }

  // Auto-create stub tables for unresolved FK references.
  // This ensures cross-template references (e.g., ward_assignments → beds)
  // always resolve, making the contract self-consistent by construction.
  const externalTables = new Set(['auth.users']);
  const missingTables = new Set<string>();
  for (const table of tableMap.values()) {
    for (const col of table.columns) {
      if (col.references) {
        const ref = col.references.table;
        if (!tableMap.has(ref) && !externalTables.has(ref)) {
          missingTables.add(ref);
        }
      }
    }
  }
  for (const name of missingTables) {
    tableMap.set(name, {
      name,
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
      rlsPolicies: [
        { name: `Users can view own ${name}`, operation: 'SELECT', using: '(select auth.uid()) = user_id' },
        { name: `Users can insert own ${name}`, operation: 'INSERT', withCheck: '(select auth.uid()) = user_id' },
        { name: `Users can update own ${name}`, operation: 'UPDATE', using: '(select auth.uid()) = user_id' },
        { name: `Users can delete own ${name}`, operation: 'DELETE', using: '(select auth.uid()) = user_id' },
      ],
    });
    console.log(`[pipeline] Auto-created stub table "${name}" for unresolved FK reference`);
  }

  // Generate seed data for all tables in topological order (parents first)
  const allTables = Array.from(tableMap.values());
  const seedUserIds = Array.from({ length: 3 }, () => faker.string.uuid());
  const finalSeedData = generateAllSeedData(allTables, 5, seedUserIds);

  return {
    tables: Array.from(tableMap.values()),
    enums: enumMap.size > 0 ? Array.from(enumMap.values()) : undefined,
    seedData: finalSeedData.length > 0 ? finalSeedData : undefined,
  };
}

/**
 * Legacy wrapper: Run both scaffold and feature phases (for backward compatibility with mock mode).
 */
export async function runPipeline(
  chatPlan: ChatPlan,
  sandbox: Sandbox,
  emit: (event: StreamEvent) => void
): Promise<Map<string, string>> {
  const { scaffoldFiles, featureFiles } = await runScaffoldPhase(chatPlan, sandbox, emit);
  const generatedContents = await runFeaturePhase(featureFiles, scaffoldFiles, sandbox, emit);

  console.log(`[pipeline] ✓ Pipeline complete: ${generatedContents.size} files`);
  return generatedContents;
}
