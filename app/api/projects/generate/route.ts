/**
 * Generation API Route
 *
 * Main SSE streaming endpoint that orchestrates the template-based generation pipeline
 */

import { NextRequest } from "next/server";
import { createRepo, getInstallationToken, buildRepoName } from "@/lib/github";
import { buildAppSlug } from "@/lib/slug";
import { runPipeline, runScaffoldPhase, runFeaturePhase } from "@/lib/template-pipeline";
import { verifyAndFix } from "@/lib/verifier";
import { createSandbox, getSandbox, getPreviewUrl, pushToGitHub, startDevServer } from "@/lib/sandbox";
import { createSupabaseProject } from "@/lib/supabase-mgmt";
import type { GenerateRequest, StreamEvent, ChatPlan } from "@/lib/types";
import { classifyFeatures } from "@/lib/feature-classifier";
import { executeTemplate } from "@/lib/template-registry";
import { getMockFileContent } from "@/lib/mock-data";
import { createSSEStream } from "@/lib/sse";

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

// Vercel Pro allows up to 5 minutes for serverless functions
export const maxDuration = 300;

/**
 * POST /api/projects/generate
 *
 * Generates a complete Next.js application from a ChatPlan using template pipeline
 */
export async function POST(req: NextRequest) {
  const body: GenerateRequest = await req.json();
  const { projectId: existingProjectId, prompt, chatPlan, model = "claude-sonnet-4-5-20250929" } = body;

  if (!chatPlan) {
    return new Response(
      JSON.stringify({ error: "chatPlan is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Mock mode: simulate the entire pipeline with fixture data
  if (MOCK_MODE) {
    return buildMockGenerateResponse(chatPlan);
  }

  // Check authentication
  const { createClient } = await import("@/lib/supabase-server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return createSSEStream(async (emit) => {
    let projectId: string | null = null;

    try {
        // Reuse existing project (from chat) or create a new one
        let project;
        if (existingProjectId) {
          const { data, error } = await supabase
            .from("projects")
            .update({
              name: chatPlan.appName,
              prompt,
              status: "generating",
              plan: chatPlan,
              model,
            })
            .eq("id", existingProjectId)
            .eq("user_id", user.id)
            .select()
            .single();
          if (error || !data) {
            throw new Error(`Failed to update project: ${error?.message}`);
          }
          project = data;
        } else {
          const { data, error } = await supabase
            .from("projects")
            .insert({
              user_id: user.id,
              name: chatPlan.appName,
              prompt,
              status: "generating",
              plan: chatPlan,
              model,
            })
            .select()
            .single();
          if (error || !data) {
            throw new Error(`Failed to create project: ${error?.message}`);
          }
          project = data;
        }
        projectId = project.id;

        // Stage 1: Reuse pre-provisioned sandbox or create one
        emit({ type: "stage_update", stage: "provisioning" });

        let sandbox;
        // Check if sandbox was pre-provisioned during chat
        const { data: existingProject } = await supabase
          .from("projects")
          .select("sandbox_id, supabase_project_id")
          .eq("id", project.id)
          .single();

        if (existingProject?.sandbox_id) {
          sandbox = await getSandbox(existingProject.sandbox_id);
          console.log(`✓ Reusing pre-provisioned sandbox: ${sandbox.id}`);
        } else {
          sandbox = await createSandbox({
            language: "typescript",
            labels: { app: chatPlan.appName, type: "vibestack-generated" },
          });
        }

        // Supabase project creation (runs in parallel with generation)
        let supabaseProject: import("@/lib/types").SupabaseProject | null = null;
        let supabaseProjectId = existingProject?.supabase_project_id ?? null;
        const supabasePromise = !supabaseProjectId
          ? createSupabaseProject(chatPlan.appName)
              .then((p) => { supabaseProject = p; supabaseProjectId = p.id; })
          : Promise.resolve();

        await supabase
          .from("projects")
          .update({ sandbox_id: sandbox.id })
          .eq("id", project.id);

        // Stage 2: Scaffold Phase — write layer 0 files + install dependencies
        emit({ type: "stage_update", stage: "generating" });
        const { scaffoldFiles, featureFiles, allMigrations, schemaContract } = await runScaffoldPhase(chatPlan, sandbox, emit);

        // Stage 2.1: Derive SQL + Types from SchemaContract (deterministic, no LLM fix loops)
        if (schemaContract) {
          const { validateContract } = await import("@/lib/schema-contract");
          const { contractToSQL } = await import("@/lib/contract-to-sql");
          const { contractToTypes } = await import("@/lib/contract-to-types");

          const validation = validateContract(schemaContract);
          if (!validation.valid) {
            throw new Error(`Schema contract invalid: ${validation.errors.join('; ')}`);
          }

          const migrationSQL = contractToSQL(schemaContract);
          const typesTS = contractToTypes(schemaContract);

          const { uploadFile: upload } = await import("@/lib/sandbox");
          await upload(sandbox, migrationSQL, '/workspace/supabase/migrations/001_init.sql');
          await upload(sandbox, typesTS, '/workspace/src/types/database.types.ts');

          const migrationFile = scaffoldFiles.find(f => f.path === 'supabase/migrations/001_init.sql');
          if (migrationFile) migrationFile.content = migrationSQL;
          scaffoldFiles.push({ path: 'src/types/database.types.ts', content: typesTS, layer: 0 });

          const { validateMigration } = await import("@/lib/local-supabase");
          await validateMigration(sandbox, migrationSQL);

          allMigrations.splice(0, allMigrations.length, migrationSQL);
          emit({ type: "checkpoint", label: "Database ready", status: "complete" });
        } else if (allMigrations.length > 0) {
          // Fallback: legacy raw SQL path (templates without schema)
          const migrationContent = allMigrations.join('\n\n-- ---\n\n');
          const { applyLocalMigration } = await import("@/lib/local-supabase");
          const validatedSQL = await applyLocalMigration(sandbox, migrationContent, model);
          allMigrations.splice(0, allMigrations.length, validatedSQL);
          const migrationFile = scaffoldFiles.find(f => f.path === 'supabase/migrations/001_init.sql');
          if (migrationFile) {
            migrationFile.content = validatedSQL;
            const { uploadFile: upload } = await import("@/lib/sandbox");
            await upload(sandbox, validatedSQL, '/workspace/supabase/migrations/001_init.sql');
          }
          emit({ type: "checkpoint", label: "Database ready", status: "complete" });
        }

        // Stage 2.5: Start dev server + emit preview URL (HMR ready)
        emit({ type: "checkpoint", label: "Starting dev server", status: "active" });
        const { url: previewUrlStr } = await startDevServer(sandbox);
        emit({ type: "preview_ready", url: previewUrlStr });
        emit({ type: "checkpoint", label: "Starting dev server", status: "complete" });
        console.log(`✓ Dev server started: ${previewUrlStr}`);

        // Start live error fixer in parallel
        const { LiveFixer } = await import("@/lib/live-fixer");
        const liveFixer = new LiveFixer(
          sandbox,
          model,
          emit,
          featureFiles.map(f => f.path),
        );
        // Also mark scaffold files as already written
        for (const f of scaffoldFiles) {
          liveFixer.markFileWritten(f.path, f.content);
        }
        liveFixer.start();

        // Stage 2.6: Feature Phase — write feature files one by one (triggers HMR)
        const generatedFiles = await runFeaturePhase(featureFiles, scaffoldFiles, sandbox, emit, liveFixer);

        const liveFixCount = liveFixer.stop();
        if (liveFixCount > 0) {
          console.log(`[generate] Live fixer applied ${liveFixCount} fixes during generation`);
          emit({ type: 'checkpoint', label: `Fixed ${liveFixCount} errors during generation`, status: 'complete' });
        }

        // Stage 3: Build Verification
        emit({ type: "stage_update", stage: "verifying_build" });
        console.log(`[generate] Starting final type check (live fixer already fixed ${liveFixCount} errors)`);
        const verifyTimeout = new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error("Build verification timed out (5 min)")), 300_000)
        );
        const buildPassed = await Promise.race([
          verifyAndFix(sandbox, generatedFiles, model, emit),
          verifyTimeout,
        ]);
        if (!buildPassed) {
          throw new Error("Build verification failed after maximum retries");
        }

        // Wait for Supabase project and store credentials
        await supabasePromise;
        if (supabaseProject) {
          const sp = supabaseProject as import("@/lib/types").SupabaseProject;
          await supabase
            .from("projects")
            .update({
              supabase_project_id: sp.id,
              supabase_url: sp.url,
              supabase_anon_key: sp.anonKey,
              supabase_service_role_key: sp.serviceRoleKey,
            })
            .eq("id", project.id);

          // Apply migrations to the provisioned Supabase project
          const migrationContent = generatedFiles.get("supabase/migrations/001_init.sql");
          if (migrationContent) {
            emit({ type: "checkpoint", label: "Applying database migrations", status: "active" });
            const { runMigration } = await import("@/lib/supabase-mgmt");
            const result = await runMigration(sp.id, migrationContent);
            if (!result.success) {
              throw new Error(`Database migration failed: ${result.error}`);
            }
            emit({ type: "checkpoint", label: "Applying database migrations", status: "complete" });
          }
        }

        // Stage 4: Push to GitHub
        emit({ type: 'checkpoint', label: 'Pushing to GitHub', status: 'active' });
        const repoName = buildRepoName(chatPlan.appName, project.id);
        const { cloneUrl, htmlUrl } = await createRepo(repoName);
        const token = await getInstallationToken();
        await pushToGitHub(sandbox, cloneUrl, token);
        const githubRepoUrl = htmlUrl;
        emit({ type: 'checkpoint', label: 'Pushing to GitHub', status: 'complete' });
        console.log(`✓ Pushed to GitHub: ${htmlUrl}`);

        // Stage 5: Code Server URL
        const codeServerUrl = await getPreviewUrl(sandbox, 13337);
        const codeServerUrlStr = codeServerUrl.url;
        emit({ type: "code_server_ready", url: codeServerUrlStr });

        // Stage 6: Completion
        emit({ type: "stage_update", stage: "complete" });

        const wildcardDomain = process.env.VERCEL_WILDCARD_DOMAIN;
        const eagerDeployUrl = wildcardDomain
          ? `https://${buildAppSlug(chatPlan.appName, project.id)}.${wildcardDomain}`
          : undefined;

        await supabase
          .from("projects")
          .update({
            status: "complete",
            preview_url: previewUrlStr,
            code_server_url: codeServerUrlStr,
            github_repo_url: githubRepoUrl,
            ...(eagerDeployUrl ? { deploy_url: eagerDeployUrl } : {}),
          })
          .eq("id", project.id);

        emit({
          type: "complete",
          projectId: project.id,
          urls: { preview: previewUrlStr, codeServer: codeServerUrlStr },
          requirementResults: [],
        });
      } catch (error) {
        console.error("[generate] Error:", error);

        if (projectId) {
          await supabase.from("projects").update({ status: "error" }).eq("id", projectId);
        }

        emit({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
          stage: "error",
        });
      }
    });
}

/**
 * Mock generate response — simulates the template pipeline with delays.
 */
function buildMockGenerateResponse(chatPlan: ChatPlan) {
  return createSSEStream(async (emit) => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // Stage 1: Provisioning
      emit({ type: "stage_update", stage: "provisioning" });
      await delay(400);

      // Stage 2: Scaffold phase
      emit({ type: "stage_update", stage: "generating" });
      emit({ type: "checkpoint", label: "Layer 0: scaffold and config", status: "active" });
      await delay(300);
      emit({ type: "checkpoint", label: "Layer 0: scaffold and config", status: "complete" });
      emit({ type: "checkpoint", label: "Installing dependencies", status: "active" });
      await delay(200);
      emit({ type: "checkpoint", label: "Installing dependencies", status: "complete" });

      // Stage 2.5: Dev server + preview (early)
      emit({ type: "checkpoint", label: "Starting dev server", status: "active" });
      await delay(200);
      emit({ type: "preview_ready", url: "http://localhost:3000" });
      emit({ type: "checkpoint", label: "Starting dev server", status: "complete" });

      // Database ready (local migration)
      emit({ type: "checkpoint", label: "Database ready", status: "complete" });

      // Stage 3: Feature phase (files trigger HMR)
      const tasks = classifyFeatures(chatPlan.features);
      for (const task of tasks) {
        try {
          const result = await executeTemplate(task, chatPlan.designTokens);
          for (const file of result.files) {
            emit({ type: "file_start", path: file.path, layer: file.layer });
            await delay(50 + Math.random() * 100);

            const content = file.content || getMockFileContent(file.path);
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i += 5) {
              const chunk = lines.slice(i, i + 5).join("\n") + "\n";
              emit({ type: "file_chunk", path: file.path, chunk });
              await delay(30);
            }

            emit({ type: "file_complete", path: file.path, linesOfCode: lines.length });
          }
        } catch {
          // Template not found in mock mode — generate stub files
          const stubFiles = [`${task.template}/stub.ts`];
          for (const path of stubFiles) {
            emit({ type: "file_start", path, layer: 0 });
            const content = getMockFileContent(path);
            emit({ type: "file_chunk", path, chunk: content });
            emit({ type: "file_complete", path, linesOfCode: content.split("\n").length });
            await delay(50);
          }
        }
      }

      // Stage 4: Build verification (tsc --noEmit)
      emit({ type: "stage_update", stage: "verifying_build" });
      emit({ type: "checkpoint", label: "Build verification", status: "active" });
      await delay(400);
      emit({ type: "checkpoint", label: "Build verification", status: "complete" });

      // Stage 5: GitHub push
      emit({ type: "checkpoint", label: "Pushing to GitHub", status: "active" });
      await delay(200);
      emit({ type: "checkpoint", label: "Pushing to GitHub", status: "complete" });

    // Stage 6: Complete
    emit({ type: "stage_update", stage: "complete" });
    emit({ type: "code_server_ready", url: "http://localhost:13337" });
    emit({
      type: "complete",
      projectId: "mock-project-id",
      urls: { preview: "http://localhost:3000", codeServer: "http://localhost:13337" },
      requirementResults: [],
    });
  });
}
