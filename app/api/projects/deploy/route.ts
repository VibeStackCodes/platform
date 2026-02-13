/**
 * Deploy API Route
 *
 * Downloads files from Daytona sandbox and deploys to Vercel
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { downloadDirectory, getDaytonaClient, runCommand } from "@/lib/sandbox";
import { buildAppSlug } from "@/lib/slug";
import type { DeployRequest } from "@/lib/types";

/**
 * Build the project in sandbox with production env vars
 */
async function buildInSandbox(
  sandbox: any,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<Array<{ path: string; content: Buffer }>> {
  // Write production env vars
  await sandbox.fs.uploadFile(
    Buffer.from(`VITE_SUPABASE_URL=${supabaseUrl}\nVITE_SUPABASE_ANON_KEY=${supabaseAnonKey}\n`),
    '/workspace/.env.production'
  );

  // Run production build
  const result = await runCommand(
    sandbox,
    'bun run build',
    'prod-build',
    { cwd: '/workspace', timeout: 120 }
  );

  if (result.exitCode !== 0) {
    throw new Error(`Production build failed: ${result.stdout}\n${result.stderr || ''}`);
  }

  // Download dist/
  return await downloadDirectory(sandbox, '/workspace/dist');
}

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

    // Build Supabase env vars from stored credentials
    const supabaseEnvVars: Record<string, string> = {};
    if (project.supabase_url) {
      supabaseEnvVars.VITE_SUPABASE_URL = project.supabase_url;
    }
    if (project.supabase_anon_key) {
      supabaseEnvVars.VITE_SUPABASE_ANON_KEY = project.supabase_anon_key;
    }

    console.log(`[deploy] Project: ${project.name}, GitHub: ${project.github_repo_url || 'none'}, Sandbox: ${project.sandbox_id}`);
    console.log(`[deploy] Supabase env vars: ${Object.keys(supabaseEnvVars).join(', ') || 'none'}`);

    let vercelProjectSlug: string;

    if (project.sandbox_id && project.supabase_url && project.supabase_anon_key) {
      console.log(`[deploy] Pre-built deploy: building in sandbox...`);
      const builtFiles = await buildInSandbox(sandbox, project.supabase_url, project.supabase_anon_key);
      console.log(`[deploy] Built ${builtFiles.length} files, deploying to Vercel...`);
      deployUrl = await deployToVercel(project.name, builtFiles, vercelTeamId, supabaseEnvVars);
      vercelProjectSlug = project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    } else if (project.github_repo_url) {
      // Deploy from GitHub repo (required path)
      const repoFullName = project.github_repo_url
        .replace("https://github.com/", "");
      console.log(`[deploy] Deploying from GitHub: ${repoFullName}`);
      const result = await deployFromGitHub(repoFullName, project.name, vercelTeamId, supabaseEnvVars);
      deployUrl = result.deployUrl;
      vercelProjectSlug = result.vercelProjectSlug;
    } else {
      // Fallback: download files and upload to Vercel
      console.log(`[deploy] No GitHub repo, falling back to file upload...`);
      const files = await downloadDirectory(sandbox, "/workspace");
      console.log(`[deploy] Downloaded ${files.length} files, deploying to Vercel...`);
      deployUrl = await deployToVercel(project.name, files, vercelTeamId, supabaseEnvVars);
      vercelProjectSlug = project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    }

    console.log(`[deploy] Deployment successful: ${deployUrl}`);

    // Assign custom domain alias to the actual deployed project
    const wildcardDomain = process.env.VERCEL_WILDCARD_DOMAIN; // e.g. "vibestack.site"
    if (wildcardDomain) {
      const appSlug = buildAppSlug(project.name, projectId);
      const customDomain = `${appSlug}.${wildcardDomain}`;
      deployUrl = await assignCustomDomain(customDomain, vercelProjectSlug);
      console.log(`[deploy] Custom domain assigned: ${deployUrl}`);
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
      throw new Error(`Failed to update project status: ${updateError.message}`);
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
  teamId?: string,
  envVars?: Record<string, string>
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
        ...(envVars && Object.keys(envVars).length > 0
          ? { env: envVars }
          : {}),
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
 * Deploy by creating a Vercel project linked to a GitHub repo,
 * then triggering an explicit deployment with gitSource.
 */
async function deployFromGitHub(
  repoFullName: string,
  projectName: string,
  teamId?: string,
  envVars?: Record<string, string>
): Promise<{ deployUrl: string; vercelProjectSlug: string }> {
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) {
    throw new Error("VERCEL_TOKEN environment variable is required");
  }

  const defaultTeamId = process.env.VERCEL_TEAM_ID;
  const finalTeamId = teamId || defaultTeamId;
  const slug = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  // Step 1: Get numeric GitHub repo ID (required by Vercel v13 API)
  const ghToken = process.env.GITHUB_TOKEN;
  const ghRes = await fetch(`https://api.github.com/repos/${repoFullName}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
    },
  });
  if (!ghRes.ok) {
    throw new Error(`Failed to fetch GitHub repo info: ${await ghRes.text()}`);
  }
  const ghRepo = (await ghRes.json()) as { id: number; default_branch: string };
  const repoId = ghRepo.id;
  console.log(`[deploy] GitHub repo ${repoFullName}: id=${repoId}, branch=${ghRepo.default_branch}`);

  // Step 2: Create Vercel project linked to GitHub repo
  const projectResponse = await fetch(
    `https://api.vercel.com/v10/projects${finalTeamId ? `?teamId=${finalTeamId}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: slug,
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

  if (projectResponse.ok) {
    const project = await projectResponse.json();
    console.log(`[deploy] Vercel project created: ${project.id}`);
  } else if (projectResponse.status === 409) {
    console.log(`[deploy] Vercel project "${slug}" already exists, continuing...`);
  } else {
    const errorBody = await projectResponse.text();
    throw new Error(`Vercel project creation failed: ${errorBody}`);
  }

  // Step 2.5: Set environment variables on the Vercel project
  if (envVars && Object.keys(envVars).length > 0) {
    await setVercelEnvVars(slug, envVars, finalTeamId, vercelToken);
  }

  // Step 3: Create explicit deployment with gitSource (doesn't rely on Vercel GitHub App)
  const deployResponse = await fetch(
    `https://api.vercel.com/v13/deployments${finalTeamId ? `?teamId=${finalTeamId}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: slug,
        gitSource: {
          type: "github",
          repoId,
          ref: ghRepo.default_branch,
        },
        target: "production",
      }),
    }
  );

  if (!deployResponse.ok) {
    const error = await deployResponse.text();
    throw new Error(`Vercel deployment creation failed: ${error}`);
  }

  const deployment: VercelDeployment = await deployResponse.json();
  const deployUrl = `https://${deployment.url}`;
  console.log(`[deploy] Deployment created: ${deployUrl} (${deployment.id})`);

  await waitForDeploymentReady(deployment.id, finalTeamId, vercelToken);

  return { deployUrl, vercelProjectSlug: slug };
}

/**
 * Set environment variables on a Vercel project
 */
async function setVercelEnvVars(
  projectSlug: string,
  envVars: Record<string, string>,
  teamId: string | undefined,
  token: string
): Promise<void> {
  const body = Object.entries(envVars).map(([key, value]) => ({
    key,
    value,
    target: ["production", "preview", "development"],
    type: "encrypted",
  }));

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${projectSlug}/env${teamId ? `?teamId=${teamId}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to set Vercel env vars: ${error}`);
  }

  console.log(`[deploy] Set ${body.length} env vars on project ${projectSlug}`);
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
  vercelProjectSlug: string
): Promise<string> {
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) {
    throw new Error("VERCEL_TOKEN environment variable is required");
  }

  const teamId = process.env.VERCEL_TEAM_ID;

  const response = await fetch(
    `https://api.vercel.com/v10/projects/${vercelProjectSlug}/domains${teamId ? `?teamId=${teamId}` : ""}`,
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
