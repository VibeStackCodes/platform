/**
 * Deploy API Route
 *
 * Downloads files from Daytona sandbox and deploys to Vercel
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { downloadDirectory, getDaytonaClient } from "@/lib/sandbox";
import { buildAppSlug } from "@/lib/slug";
import type { DeployRequest } from "@/lib/types";

/**
 * POST /api/projects/deploy
 *
 * Deploys a generated project to Vercel
 */
export async function POST(req: NextRequest) {
  try {
    // Parse request
    const body: DeployRequest = await req.json();
    const { projectId, vercelTeamId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
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

    if (!project.sandbox_id) {
      return NextResponse.json(
        { error: "Project has no sandbox" },
        { status: 400 }
      );
    }

    // Get Daytona sandbox
    const daytona = getDaytonaClient();
    const sandbox = await daytona.get(project.sandbox_id);

    if (!sandbox) {
      return NextResponse.json(
        { error: "Sandbox not found" },
        { status: 404 }
      );
    }

    console.log(`[deploy] Downloading files from sandbox ${sandbox.id}...`);

    let deployUrl: string;

    console.log(`[deploy] Project: ${project.name}, GitHub: ${project.github_repo_url || 'none'}, Sandbox: ${project.sandbox_id}`);

    // Always deploy from sandbox files (reliable) — GitHub push may fail silently
    console.log(`[deploy] Downloading files from sandbox for deployment...`);
    const files = await downloadDirectory(sandbox, "/workspace");
    console.log(`[deploy] Downloaded ${files.length} files, deploying to Vercel...`);
    deployUrl = await deployToVercel(project.name, files, vercelTeamId);

    console.log(`[deploy] Deployment successful: ${deployUrl}`);

    // Assign custom domain alias if wildcard project is configured
    const wildcardProjectId = process.env.VERCEL_WILDCARD_PROJECT_ID;
    if (wildcardProjectId) {
      const appSlug = buildAppSlug(project.name, projectId);
      const customDomain = `${appSlug}.vibestack.site`;
      try {
        deployUrl = await assignCustomDomain(customDomain, wildcardProjectId);
        console.log(`[deploy] Custom domain assigned: ${deployUrl}`);
      } catch (domainError) {
        console.warn("[deploy] Custom domain assignment failed (non-fatal):", domainError);
        // Keep the original Vercel URL as fallback
      }
    }

    // Update project with deploy URL
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        deploy_url: deployUrl,
        status: "deployed",
      })
      .eq("id", projectId);

    if (updateError) {
      console.error("[deploy] Failed to update project:", updateError);
      // Don't fail the request - deployment was successful
    }

    return NextResponse.json({
      success: true,
      deployUrl,
      projectId,
    });
  } catch (error) {
    console.error("[deploy] Deployment failed:", error);
    return NextResponse.json(
      {
        error: "Deployment failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Vercel Deployment
// ============================================================================

interface VercelFile {
  file: string;
  data: string; // base64-encoded content
}

interface VercelDeployment {
  id: string;
  url: string;
  readyState: string;
}

/**
 * Deploy files to Vercel using the Vercel REST API
 */
async function deployToVercel(
  projectName: string,
  files: Array<{ path: string; content: Buffer }>,
  teamId?: string
): Promise<string> {
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) {
    throw new Error("VERCEL_TOKEN environment variable is required");
  }

  const defaultTeamId = process.env.VERCEL_TEAM_ID;
  const finalTeamId = teamId || defaultTeamId;

  // Prepare files in Vercel format
  const vercelFiles: VercelFile[] = files.map((f) => ({
    file: f.path,
    data: f.content.toString("base64"),
  }));

  // Create deployment
  const deploymentResponse = await fetch(
    `https://api.vercel.com/v13/deployments${finalTeamId ? `?teamId=${finalTeamId}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        files: vercelFiles,
        projectSettings: {
          framework: "vite",
          buildCommand: "bun run build",
          devCommand: "bun run dev",
          installCommand: "bun install",
          outputDirectory: "dist",
        },
        target: "production",
      }),
    }
  );

  if (!deploymentResponse.ok) {
    const error = await deploymentResponse.text();
    throw new Error(`Vercel deployment failed: ${error}`);
  }

  const deployment: VercelDeployment = await deploymentResponse.json();

  // Poll deployment until ready
  const deployUrl = `https://${deployment.url}`;
  console.log(`[deploy] Deployment created: ${deployUrl} (${deployment.id})`);

  await waitForDeploymentReady(deployment.id, finalTeamId, vercelToken);

  return deployUrl;
}

/**
 * Deploy by creating a Vercel project linked to a GitHub repo.
 * Vercel auto-deploys from the main branch.
 */
async function deployFromGitHub(
  repoFullName: string,
  projectName: string,
  teamId?: string
): Promise<string> {
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) {
    throw new Error("VERCEL_TOKEN environment variable is required");
  }

  const defaultTeamId = process.env.VERCEL_TEAM_ID;
  const finalTeamId = teamId || defaultTeamId;

  // Create Vercel project linked to GitHub repo
  const projectResponse = await fetch(
    `https://api.vercel.com/v10/projects${finalTeamId ? `?teamId=${finalTeamId}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        framework: "vite",
        buildCommand: "bun run build",
        installCommand: "bun install",
        outputDirectory: "dist",
        gitRepository: {
          type: "github",
          repo: repoFullName,
        },
      }),
    }
  );

  if (!projectResponse.ok) {
    const error = await projectResponse.text();
    throw new Error(`Vercel project creation failed: ${error}`);
  }

  const vercelProject = (await projectResponse.json()) as { id: string };

  // Trigger deployment from latest commit
  const deployResponse = await fetch(
    `https://api.vercel.com/v13/deployments${finalTeamId ? `?teamId=${finalTeamId}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        project: vercelProject.id,
        target: "production",
        gitSource: {
          type: "github",
          repo: repoFullName,
          ref: "main",
        },
      }),
    }
  );

  if (!deployResponse.ok) {
    const error = await deployResponse.text();
    throw new Error(`Vercel deployment failed: ${error}`);
  }

  const deployment: VercelDeployment = await deployResponse.json();
  const deployUrl = `https://${deployment.url}`;
  console.log(`[deploy] GitHub deployment created: ${deployUrl} (${deployment.id})`);

  await waitForDeploymentReady(deployment.id, finalTeamId, vercelToken);

  return deployUrl;
}

/**
 * Poll Vercel deployment until it's ready
 */
async function waitForDeploymentReady(
  deploymentId: string,
  teamId: string | undefined,
  token: string,
  maxAttempts: number = 60 // 5 minutes with 5s intervals
): Promise<void> {
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const statusResponse = await fetch(
      `https://api.vercel.com/v13/deployments/${deploymentId}${teamId ? `?teamId=${teamId}` : ""}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!statusResponse.ok) {
      throw new Error(`Failed to check deployment status: ${await statusResponse.text()}`);
    }

    const deployment: VercelDeployment = await statusResponse.json();
    console.log(`[deploy] Deployment status: ${deployment.readyState} (attempt ${attempt + 1}/${maxAttempts})`);

    if (deployment.readyState === "READY") {
      console.log(`[deploy] Deployment ready!`);
      return;
    }

    if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
      // Try to fetch build logs for debugging
      try {
        const logsResponse = await fetch(
          `https://api.vercel.com/v3/deployments/${deploymentId}/events${teamId ? `?teamId=${teamId}` : ""}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (logsResponse.ok) {
          const events = await logsResponse.json();
          const errorEvents = events
            .filter((e: { type: string }) => e.type === "error" || e.type === "stderr")
            .slice(-10);
          console.error("[deploy] Build error logs:", JSON.stringify(errorEvents, null, 2));
        }
      } catch {
        // Ignore log fetch errors
      }
      throw new Error(`Deployment failed with state: ${deployment.readyState}`);
    }
  }

  throw new Error("Deployment timed out waiting for READY state");
}

/**
 * Add a custom domain alias to the wildcard Vercel project.
 * Returns the full https URL for the custom domain.
 */
async function assignCustomDomain(
  domain: string,
  wildcardProjectId: string
): Promise<string> {
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) {
    throw new Error("VERCEL_TOKEN environment variable is required");
  }

  const teamId = process.env.VERCEL_TEAM_ID;

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${wildcardProjectId}/domains${teamId ? `?teamId=${teamId}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to assign domain ${domain}: ${error}`);
  }

  return `https://${domain}`;
}
