import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import type { FileSpec, DesignTokens } from './types';

/**
 * Skill Injector Module
 *
 * Finds and injects skill content into file generation prompts.
 * - Searches local and global skill directories
 * - Concatenates skill content with delimiters
 * - Builds complete prompts with all context
 */

// ============================================================================
// Constants
// ============================================================================

const LOCAL_SKILLS_DIR = join(process.cwd(), 'skills');
const GLOBAL_SKILLS_DIR = join(process.env.HOME || '~', '.claude', 'skills');

// ============================================================================
// Skill Discovery
// ============================================================================

/**
 * Find skill content by name
 *
 * Search order:
 * 1. Local skills/ directory (exact match)
 * 2. Local skills/ directory (fuzzy match)
 * 3. Global ~/.claude/skills/ (exact match)
 * 4. Global ~/.claude/skills/ (fuzzy match)
 *
 * @param skillName - Name of the skill to find
 * @returns Skill content or null if not found
 */
export function findSkillContent(skillName: string): string | null {
  // 1. Try exact match in local skills
  const localExact = join(LOCAL_SKILLS_DIR, skillName, 'SKILL.md');
  if (existsSync(localExact)) {
    return readFileSync(localExact, 'utf-8');
  }

  // 2. Try fuzzy match in local skills
  const localPattern = join(LOCAL_SKILLS_DIR, `*${skillName}*`, 'SKILL.md');
  const localMatches = glob.sync(localPattern);
  if (localMatches.length > 0) {
    return readFileSync(localMatches[0], 'utf-8');
  }

  // 3. Try exact match in global skills
  const globalExact = join(GLOBAL_SKILLS_DIR, skillName, 'SKILL.md');
  if (existsSync(globalExact)) {
    return readFileSync(globalExact, 'utf-8');
  }

  // 4. Try fuzzy match in global skills
  const globalPattern = join(GLOBAL_SKILLS_DIR, `*${skillName}*`, 'SKILL.md');
  const globalMatches = glob.sync(globalPattern);
  if (globalMatches.length > 0) {
    return readFileSync(globalMatches[0], 'utf-8');
  }

  console.warn(`Skill not found: ${skillName}`);
  return null;
}

/**
 * Inject multiple skills into a prompt
 *
 * Concatenates skill content with clear delimiters.
 * Skips skills that cannot be found.
 *
 * @param skillNames - Array of skill names to inject
 * @returns Concatenated skill content with delimiters
 */
export function injectSkills(skillNames: string[]): string {
  if (skillNames.length === 0) {
    return '';
  }

  const skillContents: string[] = [];

  for (const skillName of skillNames) {
    const content = findSkillContent(skillName);
    if (content) {
      skillContents.push(`# SKILL: ${skillName}\n\n${content}\n`);
    }
  }

  if (skillContents.length === 0) {
    return '';
  }

  return `\n\n# INJECTED SKILLS\n\n${skillContents.join('\n---\n\n')}`;
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build complete file generation prompt
 *
 * Assembles all context for generating a single file:
 * - File purpose and requirements
 * - Design tokens
 * - Supabase configuration
 * - Dependency file contents
 * - Skill references
 * - Generation rules
 *
 * @param fileSpec - File specification from plan
 * @param depContents - Map of dependency file paths to their contents
 * @param designTokens - Design tokens from plan
 * @param supabaseUrl - Supabase project URL
 * @param supabaseAnonKey - Supabase anonymous key
 * @returns Complete prompt for Claude API
 */
export function buildFilePrompt(
  fileSpec: FileSpec,
  depContents: Map<string, string>,
  designTokens: DesignTokens,
  supabaseUrl: string,
  supabaseAnonKey: string
): string {
  // Build dependency context
  let dependencyContext = '';
  if (fileSpec.dependsOn.length > 0) {
    dependencyContext = '\n\n## DEPENDENCIES\n\nThis file depends on the following files:\n\n';

    for (const depPath of fileSpec.dependsOn) {
      const depContent = depContents.get(depPath);
      if (depContent) {
        dependencyContext += `### ${depPath}\n\`\`\`typescript\n${depContent}\n\`\`\`\n\n`;
      }
    }
  }

  // Build requirements context
  const requirementsContext = fileSpec.requirements.length > 0
    ? `\n\n## REQUIREMENTS ADDRESSED\n\nThis file addresses the following requirements:\n${fileSpec.requirements.map(req => `- ${req}`).join('\n')}\n`
    : '';

  // Inject skills
  const skillsContext = injectSkills(fileSpec.skills);

  // Build design tokens context
  const designContext = `\n\n## DESIGN TOKENS\n\nApply these design tokens to the implementation:\n- Primary Color: ${designTokens.primaryColor}\n- Accent Color: ${designTokens.accentColor}\n- Font Family: ${designTokens.fontFamily}\n- Spacing: ${designTokens.spacing}\n- Border Radius: ${designTokens.borderRadius}\n`;

  // Build Supabase context
  const supabaseContext = `\n\n## SUPABASE CONFIGURATION\n\nUse these Supabase credentials:\n- URL: ${supabaseUrl}\n- Anon Key: ${supabaseAnonKey}\n\nNEVER hardcode these values - always use environment variables or import from config.\n`;

  // Build generation rules
  const rules = `\n\n## GENERATION RULES

CRITICAL REQUIREMENTS:
1. **NO MARKDOWN FENCES** - Return ONLY the file content, no \`\`\`typescript or \`\`\` fences
2. **Use shadcn/ui** - Use components from @/components/ui (assume they exist)
3. **Handle loading states** - Show loading UI for async operations
4. **Handle error states** - Show error messages when operations fail
5. **TypeScript strict mode** - Use proper types, no 'any' unless necessary
6. **Import from dependencies** - Reference the dependency files provided above
7. **Follow Next.js 16 conventions** - Use App Router patterns, Server Actions when appropriate
8. **Accessibility** - Use semantic HTML and ARIA labels
9. **Responsive design** - Mobile-first approach using Tailwind
10. **Environment variables** - Use process.env for sensitive data

FILE CONTENT:`;

  // Assemble complete prompt
  return `Generate the file: ${fileSpec.path}

## FILE PURPOSE

${fileSpec.description}
${requirementsContext}${dependencyContext}${skillsContext}${designContext}${supabaseContext}${rules}`;
}
