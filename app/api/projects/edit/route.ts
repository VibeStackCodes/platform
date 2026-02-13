/**
 * Edit API Route
 *
 * Incrementally re-generates specific files based on user edit instructions
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase-server";
import { getDaytonaClient } from "@/lib/sandbox";
import { uploadFile } from "@/lib/sandbox";
import { verifyAndFix } from "@/lib/verifier";
import { buildFilePrompt } from "@/lib/injector";
import type { EditRequest, GenerationState, Plan, FileSpec } from "@/lib/types";

/**
 * POST /api/projects/edit
 *
 * Re-generates specific files based on edit instruction
 */
export async function POST(req: NextRequest) {
  try {
    // Parse request
    const body: EditRequest = await req.json();
    const { projectId, instruction, model = "claude-sonnet-4-5-20250929" } = body;

    if (!projectId || !instruction) {
      return NextResponse.json(
        { error: "projectId and instruction are required" },
        { status: 400 }
      );
    }

    // Check authentication and get project from database
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: project, error: fetchError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (!project.sandbox_id || !project.generation_state || !project.plan) {
      return NextResponse.json(
        { error: "Project is not fully generated" },
        { status: 400 }
      );
    }

    const plan: Plan = project.plan;
    const existingFiles = new Map<string, string>();

    // Reconstruct existing files from generation state
    for (const fileProgress of project.generation_state.files) {
      if (fileProgress.content) {
        existingFiles.set(fileProgress.path, fileProgress.content);
      }
    }

    // Get sandbox
    const daytona = getDaytonaClient();
    const sandbox = await daytona.get(project.sandbox_id);

    console.log(`[edit] Editing project ${projectId}: "${instruction}"`);

    // ====================================================================
    // Step 1: Identify Affected Files
    // ====================================================================
    const affectedFilePaths = await identifyAffectedFiles(
      instruction,
      plan,
      model
    );

    console.log(`[edit] Identified ${affectedFilePaths.length} affected files:`, affectedFilePaths);

    if (affectedFilePaths.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No files need to be modified for this instruction",
        filesModified: [],
      });
    }

    // ====================================================================
    // Step 2: Re-generate Affected Files
    // ====================================================================
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const modifiedFiles: Array<{ path: string; content: string }> = [];

    for (const filePath of affectedFilePaths) {
      const fileSpec = plan.files.find((f) => f.path === filePath);
      if (!fileSpec) {
        console.warn(`[edit] File spec not found for ${filePath}, skipping`);
        continue;
      }

      console.log(`[edit] Regenerating ${filePath}...`);

      // Build prompt with edit context
      const prompt = await buildEditPrompt(
        fileSpec,
        instruction,
        existingFiles,
        plan
      );

      // Generate file with Claude
      const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = response.content[0].type === "text"
        ? response.content[0].text
        : "";

      // Extract code from markdown if needed
      const cleanedContent = extractCode(content);

      // Upload to sandbox
      await uploadFile(sandbox, cleanedContent, `/workspace/${filePath}`);

      modifiedFiles.push({
        path: filePath,
        content: cleanedContent,
      });

      console.log(`[edit] ✓ Regenerated ${filePath}`);
    }

    // ====================================================================
    // Step 3: Verify Build
    // ====================================================================
    console.log("[edit] Verifying build...");

    // Update existingFiles map with modified files
    for (const { path, content } of modifiedFiles) {
      existingFiles.set(path, content);
    }

    // Run verifyAndFix (without emit callback for non-streaming route)
    await verifyAndFix(
      sandbox,
      existingFiles,
      model,
      () => {} // No-op emit function
    );

    console.log("[edit] Build verified");

    // ====================================================================
    // Step 4: Update Project State
    // ====================================================================
    const updatedGenerationState = project.generation_state as GenerationState;

    // Update file contents in generation state
    for (const { path, content } of modifiedFiles) {
      const fileProgress = updatedGenerationState.files.find((f) => f.path === path);
      if (fileProgress) {
        fileProgress.content = content;
        fileProgress.linesOfCode = content.split("\n").length;
      }
    }

    const { error: updateError } = await supabase
      .from("projects")
      .update({
        generation_state: updatedGenerationState,
      })
      .eq("id", projectId);

    if (updateError) {
      console.error("[edit] Failed to update project:", updateError);
    }

    return NextResponse.json({
      success: true,
      filesModified: modifiedFiles.map((f) => f.path),
      message: `Successfully modified ${modifiedFiles.length} file(s)`,
    });
  } catch (error) {
    console.error("[edit] Error:", error);
    return NextResponse.json(
      {
        error: "Edit failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Identify which files need to be modified based on the edit instruction
 */
async function identifyAffectedFiles(
  instruction: string,
  plan: Plan,
  model: string
): Promise<string[]> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const fileList = plan.files.map((f) => `- ${f.path}: ${f.description}`).join("\n");

  const prompt = `You are analyzing an edit instruction for a Next.js application to determine which files need to be modified.

Edit Instruction: "${instruction}"

Available Files:
${fileList}

Analyze the instruction and return a JSON array of file paths that need to be modified. Consider:
- Direct file references (e.g., "update the header component")
- Feature changes (e.g., "change the primary color" affects global styles)
- Component dependencies (if A imports B and you modify A's props, B might need changes)

Return ONLY a JSON array of file paths, nothing else. Example:
["app/page.tsx", "app/components/header.tsx"]

If no files need modification, return an empty array: []`;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "[]";

  try {
    const filePaths: string[] = JSON.parse(content.trim());
    return filePaths;
  } catch (error) {
    console.error("[edit] Failed to parse affected files:", content);
    return [];
  }
}

/**
 * Build a prompt for regenerating a file with edit context
 */
async function buildEditPrompt(
  fileSpec: FileSpec,
  instruction: string,
  existingFiles: Map<string, string>,
  plan: Plan
): Promise<string> {
  const existingContent = existingFiles.get(fileSpec.path) || "";

  // Get injected context from buildFilePrompt
  const basePrompt = buildFilePrompt(
    fileSpec,
    existingFiles,
    plan.designTokens,
    "", // supabaseUrl not needed for edit context
    "" // supabaseAnonKey not needed for edit context
  );

  // Add edit instruction context
  const editPrompt = `${basePrompt}

## EDIT INSTRUCTION

You are modifying an existing file. Here is the current content:

\`\`\`
${existingContent}
\`\`\`

User's edit instruction: "${instruction}"

Modify the file according to the instruction while:
1. Preserving existing functionality that isn't affected
2. Maintaining the same code style and patterns
3. Keeping imports and dependencies consistent
4. Not breaking any existing integrations

Return the complete modified file content.`;

  return editPrompt;
}

/**
 * Extract code from markdown code blocks
 */
function extractCode(content: string): string {
  // Remove markdown code block fences if present
  const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
  const match = content.match(codeBlockRegex);

  if (match) {
    return match[1].trim();
  }

  return content.trim();
}
