/**
 * Generation API Route
 *
 * Main SSE streaming endpoint that orchestrates the template-based generation pipeline
 */

import { NextRequest } from "next/server";
import { createRepo, getInstallationToken, buildRepoName } from "@/lib/github";
import { buildAppSlug } from "@/lib/slug";
import { runPipeline } from "@/lib/template-pipeline";
import { verifyAndFix } from "@/lib/verifier";
import { createSandbox, getSandbox, getPreviewUrl, pushToGitHub } from "@/lib/sandbox";
import { createSupabaseProject } from "@/lib/supabase-mgmt";
import type { GenerateRequest, StreamEvent, ChatPlan } from "@/lib/types";
import { classifyFeatures } from "@/lib/feature-classifier";
import { executeTemplate } from "@/lib/template-registry";
import { getMockFileContent } from "@/lib/mock-data";

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

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

        // Start Supabase project creation in parallel with generation (non-blocking)
        let supabaseProjectId = existingProject?.supabase_project_id ?? null;
        const supabasePromise = !supabaseProjectId
          ? createSupabaseProject(chatPlan.appName)
              .then((p) => { supabaseProjectId = p.id; })
              .catch((e) => console.warn("[generate] Supabase project creation failed (non-fatal):", e))
          : Promise.resolve();

        await supabase
          .from("projects")
          .update({ sandbox_id: sandbox.id })
          .eq("id", project.id);

        // Stage 2: Template Pipeline (runs in parallel with Supabase provisioning)
        emit({ type: "stage_update", stage: "generating" });

        const generatedFiles = await runPipeline(chatPlan, sandbox, emit);

        // Stage 3: Build Verification (gate — must pass before GitHub push)
        emit({ type: "stage_update", stage: "verifying_build" });
        let buildPassed = false;
        try {
          const verifyTimeout = new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error("Build verification timed out (5 min)")), 300_000)
          );
          buildPassed = await Promise.race([
            verifyAndFix(sandbox, generatedFiles, model, emit),
            verifyTimeout,
          ]);
        } catch (verifyError) {
          console.warn("[generate] Build verification error:", verifyError);
          emit({ type: "checkpoint", label: "Build verification (timed out)", status: "complete" });
        }

        // Wait for Supabase project to be ready before GitHub push
        await supabasePromise;
        if (supabaseProjectId) {
          await supabase
            .from("projects")
            .update({ supabase_project_id: supabaseProjectId })
            .eq("id", project.id);
        }

        // Stage 3.5: Push to GitHub — only if build passed
        let githubRepoUrl: string | null = null;
        if (!buildPassed) {
          console.warn('[generate] Skipping GitHub push — build verification failed');
          emit({ type: 'checkpoint', label: 'Pushing to GitHub (skipped — build failed)', status: 'complete' });
        } else {
          try {
            emit({ type: 'checkpoint', label: 'Pushing to GitHub', status: 'active' });

            const repoName = buildRepoName(chatPlan.appName, project.id);
            const { cloneUrl, htmlUrl } = await createRepo(repoName);
            const token = await getInstallationToken();

            await pushToGitHub(sandbox, cloneUrl, token);

            githubRepoUrl = htmlUrl;
            emit({ type: 'checkpoint', label: 'Pushing to GitHub', status: 'complete' });
            console.log(`✓ Pushed to GitHub: ${htmlUrl}`);
          } catch (githubError) {
            console.warn('[generate] GitHub push failed (non-fatal):', githubError);
            emit({ type: 'checkpoint', label: 'Pushing to GitHub (skipped)', status: 'complete' });
          }
        }

        // Stage 4: Completion
        emit({ type: "stage_update", stage: "complete" });

        let previewUrlStr: string | null = null;
        let codeServerUrlStr: string | null = null;
        try {
          const previewUrl = await getPreviewUrl(sandbox, 3000);
          const codeServerUrl = await getPreviewUrl(sandbox, 13337);
          previewUrlStr = previewUrl.url;
          codeServerUrlStr = codeServerUrl.url;
          emit({ type: "preview_ready", url: previewUrlStr });
          emit({ type: "code_server_ready", url: codeServerUrlStr });
        } catch (previewError) {
          console.warn('[generate] Preview URL fetch failed (non-fatal):', previewError);
        }

        const eagerDeployUrl = process.env.VERCEL_WILDCARD_PROJECT_ID
          ? `https://${buildAppSlug(chatPlan.appName, project.id)}.vibestack.site`
          : undefined;

        const finalStatus = buildPassed ? "complete" : "build_failed";

        await supabase
          .from("projects")
          .update({
            status: finalStatus,
            ...(previewUrlStr ? { preview_url: previewUrlStr } : {}),
            ...(codeServerUrlStr ? { code_server_url: codeServerUrlStr } : {}),
            ...(githubRepoUrl ? { github_repo_url: githubRepoUrl } : {}),
            ...(eagerDeployUrl ? { deploy_url: eagerDeployUrl } : {}),
          })
          .eq("id", project.id);

        emit({
          type: "complete",
          projectId: project.id,
          urls: { preview: previewUrlStr || '', codeServer: codeServerUrlStr || '' },
          requirementResults: [],
        });

        controller.close();
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

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

/**
 * Mock generate response — simulates the template pipeline with delays.
 */
function buildMockGenerateResponse(chatPlan: ChatPlan) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // Provisioning
      emit({ type: "stage_update", stage: "provisioning" });
      await delay(800);

      // Classify features and generate mock files
      emit({ type: "stage_update", stage: "generating" });

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

      // Build verification
      emit({ type: "stage_update", stage: "verifying_build" });
      await delay(600);

      // Complete
      emit({ type: "stage_update", stage: "complete" });
      emit({ type: "preview_ready", url: "http://localhost:3000" });
      emit({ type: "code_server_ready", url: "http://localhost:13337" });
      emit({
        type: "complete",
        projectId: "mock-project-id",
        urls: { preview: "http://localhost:3000", codeServer: "http://localhost:13337" },
        requirementResults: [],
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
