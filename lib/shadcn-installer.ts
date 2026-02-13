import { readFileSync } from 'fs';
import { join } from 'path';
import type { GeneratedFile } from './types';

interface ComponentEntry {
  deps: Record<string, string>;
  requires?: string[];
}

interface DepsManifest {
  _base: string[];
  [component: string]: ComponentEntry | string[];
}

/**
 * Read shadcn component files from the registry and return them as GeneratedFile[].
 * Resolves transitive requires and always includes base components.
 */
export function installShadcnComponents(
  selected: string[]
): { files: GeneratedFile[]; deps: Record<string, string> } {
  const registryDir = join(process.cwd(), 'shadcn-registry');
  const manifest: DepsManifest = JSON.parse(
    readFileSync(join(registryDir, '_deps.json'), 'utf-8')
  );

  // Resolve full component set: base + selected + transitive requires
  const resolved = new Set<string>(manifest._base);
  const queue = [...selected];

  while (queue.length > 0) {
    const name = queue.pop()!;
    if (resolved.has(name)) continue;
    resolved.add(name);

    const entry = manifest[name];
    if (entry && !Array.isArray(entry) && entry.requires) {
      queue.push(...entry.requires);
    }
  }

  // Read files and collect deps
  const files: GeneratedFile[] = [];
  const deps: Record<string, string> = {};

  for (const name of resolved) {
    const filePath = join(registryDir, `${name}.tsx`);
    try {
      let content = readFileSync(filePath, 'utf-8');
      // Strip "use client" directive (not needed in Vite SPA)
      content = content.replace(/^"use client"\n\n?/, '');
      files.push({
        path: `src/components/ui/${name}.tsx`,
        content,
        layer: 0,
      });
    } catch {
      console.warn(`[shadcn] Component not found in registry: ${name}`);
      continue;
    }

    const entry = manifest[name];
    if (entry && !Array.isArray(entry) && entry.deps) {
      Object.assign(deps, entry.deps);
    }
  }

  console.log(`[shadcn] Resolved ${resolved.size} components (${selected.length} selected + ${manifest._base.length} base)`);
  return { files, deps };
}
