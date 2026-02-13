import type { Sandbox } from '@daytonaio/sdk';
import type { ChatPlan, StreamEvent, GeneratedFile } from './types';
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

export async function runPipeline(
  chatPlan: ChatPlan,
  sandbox: Sandbox,
  emit: (event: StreamEvent) => void
): Promise<Map<string, string>> {
  const generatedContents = new Map<string, string>();

  // 1. Classify features → template tasks
  const tasks = classifyFeatures(chatPlan.features);
  console.log(`[pipeline] Classified ${chatPlan.features.length} features → ${tasks.length} template tasks`);

  // 2. Execute templates by layer
  const allFiles: GeneratedFile[] = [];
  const allMigrations: string[] = [];
  const allDeps: Record<string, string> = {};
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
      Object.assign(allDeps, result.dependencies);
    }

    emit({
      type: 'checkpoint',
      label: `Layer ${layerIdx}: ${layerLabel}`,
      status: 'complete',
    });
  }

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

  // 4. Write all files to sandbox
  emit({ type: 'stage_update', stage: 'generating' });

  for (const file of allFiles) {
    emit({ type: 'file_start', path: file.path, layer: file.layer });

    await uploadFile(sandbox, file.content, `/workspace/${file.path}`);
    generatedContents.set(file.path, file.content);

    const linesOfCode = file.content.split('\n').length;
    emit({ type: 'file_chunk', path: file.path, chunk: file.content });
    emit({ type: 'file_complete', path: file.path, linesOfCode });

    console.log(`[pipeline] ✓ ${file.path} (${linesOfCode} lines)`);
  }

  // 5. Install dependencies
  if (Object.keys(allDeps).length > 0) {
    emit({ type: 'checkpoint', label: 'Installing dependencies', status: 'active' });

    // Read existing package.json, merge deps, write back
    // The scaffold template already writes package.json with base deps
    // We need to add template-specific deps

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
      console.warn('[pipeline] bun install failed (non-fatal):', error);
    }

    emit({ type: 'checkpoint', label: 'Installing dependencies', status: 'complete' });
  }

  // 6. Git commit all generated files
  try {
    const commitResult = await runCommand(
      sandbox,
      'cd /workspace && git add -A && git commit -m "feat: generate app from templates" && git rev-parse --short HEAD',
      'git-commit',
      { cwd: '/workspace', timeout: 30 }
    );
    const hash = commitResult.stdout.trim().split('\n').pop() || 'unknown';

    emit({
      type: 'layer_commit',
      layer: 0,
      hash,
      message: 'feat: generate app from templates',
      files: allFiles.map(f => f.path),
    });
  } catch (error) {
    console.warn('[pipeline] Git commit failed (non-fatal):', error);
  }

  console.log(`[pipeline] ✓ Pipeline complete: ${allFiles.length} files`);
  return generatedContents;
}
