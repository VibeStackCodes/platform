/**
 * Deploy API Route (Hono)
 *
 * Downloads files from Daytona sandbox and deploys to Vercel
 */

import { describeRoute, resolver } from 'hono-openapi'
import type { OpenAPIV3_1 } from 'openapi-types'
import type { Deployment } from '@vercel/client'
import { checkDeploymentStatus } from '@vercel/client'
import { Hono } from 'hono'
import { z } from 'zod'
import { getProject, updateProject } from '../lib/db/queries'
import { fetchWithTimeout } from '../lib/fetch'
import { getInstallationToken } from '../lib/github'
import { downloadDirectory, getDaytonaClient } from '../lib/sandbox'
import { conversationStore } from '../lib/conversation-store'
import { buildAppSlug } from '../lib/slug'
import type { DeployRequest } from '../lib/types'
import { log } from '../lib/logger'
import { authMiddleware } from '../middleware/auth'

const slog = log.child({ module: 'deploy' })

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const DeployRequestSchema = z.object({
  projectId: z.string().describe('ID of the project to deploy'),
  vercelTeamId: z.string().optional().describe('Vercel team ID (overrides VERCEL_TEAM_ID env var)'),
})

const DeployResponseSchema = z.object({
  success: z.literal(true),
  deployUrl: z.string().url().describe('Public URL of the deployed app'),
  projectId: z.string().describe('ID of the deployed project'),
})

const ErrorResponseSchema = z.object({
  error: z.string().describe('Error message'),
  message: z.string().optional().describe('Human-readable detail'),
})

export const projectDeployRoutes = new Hono()

// Apply auth middleware to all routes
projectDeployRoutes.use('*', authMiddleware)

/**
 * POST /api/projects/deploy
 *
 * Deploys a generated project to Vercel
 */
projectDeployRoutes.post(
  '/',
  describeRoute({
    summary: 'Deploy project to Vercel',
    description:
      'Downloads files from Daytona sandbox and deploys to Vercel. Uses GitHub repo if available.',
    tags: ['deploy'],
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: resolver(DeployRequestSchema) as unknown as OpenAPIV3_1.SchemaObject,
        },
      },
    },
    responses: {
      200: {
        description: 'Deployment successful — returns deployUrl',
        content: { 'application/json': { schema: resolver(DeployResponseSchema) } },
      },
      400: {
        description: 'Missing projectId or project has no sandbox',
        content: { 'application/json': { schema: resolver(ErrorResponseSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorResponseSchema) } },
      },
      404: {
        description: 'Project or sandbox not found',
        content: { 'application/json': { schema: resolver(ErrorResponseSchema) } },
      },
      500: {
        description: 'Deployment failed',
        content: { 'application/json': { schema: resolver(ErrorResponseSchema) } },
      },
    },
  }),
  async (c) => {
    try {
      // Parse request
      const body: DeployRequest = await c.req.json()
      const { projectId, vercelTeamId } = body

      if (!projectId) {
        return c.json({ error: 'projectId is required' }, 400)
      }

      // Get authenticated user from middleware
      const user = c.var.user

      // Fetch project from database using Drizzle
      const project = await getProject(projectId, user.id)

      if (!project) {
        return c.json({ error: 'Project not found' }, 404)
      }

      if (!project.sandboxId) {
        return c.json({ error: 'Project has no sandbox' }, 400)
      }

      // Get Daytona sandbox
      const daytona = getDaytonaClient()
      const sandbox = await daytona.get(project.sandboxId)

      if (!sandbox) {
        return c.json({ error: 'Sandbox not found' }, 404)
      }

      slog.info('Downloading files from sandbox', { sandboxId: sandbox.id, projectId })

      let deployUrl: string

      slog.info('Deploy started', {
        projectName: project.name,
        githubRepoUrl: project.githubRepoUrl ?? 'none',
        sandboxId: project.sandboxId,
      })

      let vercelProjectSlug: string

      if (project.githubRepoUrl) {
        // Deploy from GitHub repo (required path)
        const repoFullName = project.githubRepoUrl
          .replace('https://github.com/', '')
          .replace(/\.git$/, '')
        slog.info('Deploying from GitHub', { repoFullName })
        const result = await deployFromGitHub(repoFullName, project.name, vercelTeamId)
        deployUrl = result.deployUrl
        vercelProjectSlug = result.vercelProjectSlug
      } else {
        // Fallback: download files and upload to Vercel
        slog.info('No GitHub repo, falling back to file upload', { projectId })
        const files = await downloadDirectory(sandbox, '/workspace')
        slog.info('Files downloaded, deploying to Vercel', { fileCount: files.length })
        deployUrl = await deployToVercel(project.name, files, vercelTeamId)
        vercelProjectSlug = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      }

      slog.info('Deployment successful', { deployUrl, projectId })

      // Assign custom domain alias to the actual deployed project
      const wildcardDomain = process.env.VERCEL_WILDCARD_DOMAIN // e.g. "vibestack.site"
      if (wildcardDomain) {
        const appSlug = buildAppSlug(project.name, projectId)
        const customDomain = `${appSlug}.${wildcardDomain}`
        deployUrl = await assignCustomDomain(customDomain, vercelProjectSlug)
        slog.info('Custom domain assigned', { deployUrl, projectId })
      }

      // Update project with deploy URL using Drizzle
      await updateProject(projectId, {
        deployUrl,
        status: 'deployed',
      })

      // Persist deploy message to conversation store so it shows on refresh
      await conversationStore.saveMessage(projectId, user.id, {
        id: crypto.randomUUID(),
        role: 'assistant',
        type: 'message',
        parts: [{ type: 'text', text: `App deployed to ${deployUrl}` }],
      })

      return c.json({
        success: true,
        deployUrl,
        projectId,
      })
    } catch (error) {
      slog.error('Deployment failed', { error })
      return c.json(
        {
          error: 'Deployment failed',
          message: 'An error occurred during deployment — please try again',
        },
        500,
      )
    }
  },
)

// ============================================================================
// Vercel Deployment
// ============================================================================

interface VercelFile {
  file: string
  data: string // base64-encoded content
  encoding: 'base64'
}

interface VercelDeployment {
  id: string
  url: string
  readyState: string
}

/**
 * Deploy files to Vercel using the Vercel REST API
 */
async function deployToVercel(
  projectName: string,
  files: Array<{ path: string; content: Buffer }>,
  teamId?: string,
): Promise<string> {
  const vercelToken = process.env.VERCEL_TOKEN
  if (!vercelToken) {
    throw new Error('VERCEL_TOKEN environment variable is required')
  }

  const defaultTeamId = process.env.VERCEL_TEAM_ID
  const finalTeamId = teamId || defaultTeamId

  // Prepare files in Vercel format
  const vercelFiles: VercelFile[] = files.map((f) => ({
    file: f.path,
    data: f.content.toString('base64'),
    encoding: 'base64' as const,
  }))

  // Create deployment
  const deploymentResponse = await fetchWithTimeout(
    `https://api.vercel.com/v13/deployments${finalTeamId ? `?teamId=${finalTeamId}` : ''}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        files: vercelFiles,
        projectSettings: {
          framework: 'vite',
          buildCommand: 'bun run build',
          devCommand: 'bun run dev',
          installCommand: 'bun install',
          outputDirectory: 'dist',
        },
        target: 'production',
      }),
    },
  )

  if (!deploymentResponse.ok) {
    const error = await deploymentResponse.text()
    throw new Error(`Vercel deployment failed: ${error}`)
  }

  const deployment = (await deploymentResponse.json()) as VercelDeployment

  // Poll deployment until ready
  const deployUrl = `https://${deployment.url}`
  slog.info('Deployment created', { deployUrl, deploymentId: deployment.id })

  // Convert to Deployment type expected by @vercel/client
  const vercelDeployment: Deployment = {
    id: deployment.id,
    url: deployment.url,
    readyState: deployment.readyState,
  } as Deployment

  await waitForDeploymentReady(vercelDeployment, finalTeamId, vercelToken)

  return deployUrl
}

/**
 * Deploy by creating a Vercel project linked to a GitHub repo,
 * then triggering an explicit deployment with gitSource.
 */
async function deployFromGitHub(
  repoFullName: string,
  projectName: string,
  teamId?: string,
): Promise<{ deployUrl: string; vercelProjectSlug: string }> {
  const vercelToken = process.env.VERCEL_TOKEN
  if (!vercelToken) {
    throw new Error('VERCEL_TOKEN environment variable is required')
  }

  const defaultTeamId = process.env.VERCEL_TEAM_ID
  const finalTeamId = teamId || defaultTeamId
  const slug = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  // Step 1: Get numeric GitHub repo ID (required by Vercel v13 API)
  const ghToken = await getInstallationToken()
  const ghRes = await fetchWithTimeout(`https://api.github.com/repos/${repoFullName}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${ghToken}`,
    },
  })
  if (!ghRes.ok) {
    throw new Error(`Failed to fetch GitHub repo info: ${await ghRes.text()}`)
  }
  const ghRepo = (await ghRes.json()) as { id: number; default_branch: string }
  const repoId = ghRepo.id
  slog.info('GitHub repo info fetched', { repoFullName, repoId, branch: ghRepo.default_branch })

  // Step 2: Create Vercel project linked to GitHub repo
  const projectResponse = await fetchWithTimeout(
    `https://api.vercel.com/v10/projects${finalTeamId ? `?teamId=${finalTeamId}` : ''}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: slug,
        framework: 'vite',
        buildCommand: 'bun run build',
        installCommand: 'bun install',
        outputDirectory: 'dist',
        gitRepository: {
          type: 'github',
          repo: repoFullName,
        },
      }),
    },
  )

  if (projectResponse.ok) {
    const project = (await projectResponse.json()) as { id: string }
    slog.info('Vercel project created', { vercelProjectId: project.id, slug })
  } else if (projectResponse.status === 409) {
    slog.info('Vercel project already exists, continuing', { slug })
  } else {
    const errorBody = await projectResponse.text()
    throw new Error(`Vercel project creation failed: ${errorBody}`)
  }

  // Step 3: Create explicit deployment with gitSource (doesn't rely on Vercel GitHub App)
  const deployResponse = await fetchWithTimeout(
    `https://api.vercel.com/v13/deployments${finalTeamId ? `?teamId=${finalTeamId}` : ''}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: slug,
        gitSource: {
          type: 'github',
          repoId,
          ref: ghRepo.default_branch,
        },
        target: 'production',
      }),
    },
  )

  if (!deployResponse.ok) {
    const error = await deployResponse.text()
    throw new Error(`Vercel deployment creation failed: ${error}`)
  }

  const deployment = (await deployResponse.json()) as VercelDeployment
  const deployUrl = `https://${deployment.url}`
  slog.info('Deployment created', { deployUrl, deploymentId: deployment.id })

  // Convert to Deployment type expected by @vercel/client
  const vercelDeployment: Deployment = {
    id: deployment.id,
    url: deployment.url,
    readyState: deployment.readyState,
  } as Deployment

  await waitForDeploymentReady(vercelDeployment, finalTeamId, vercelToken)

  return { deployUrl, vercelProjectSlug: slug }
}

/**
 * Poll Vercel deployment until it's ready using @vercel/client
 */
async function waitForDeploymentReady(
  deployment: Deployment,
  teamId: string | undefined,
  token: string,
  maxAttempts: number = 60, // 5 minutes with 5s intervals
): Promise<void> {
  const clientOptions = {
    token,
    teamId,
    path: '', // Not used for status checks
  }

  let attempt = 0

  for await (const event of checkDeploymentStatus(deployment, clientOptions)) {
    attempt++

    if (attempt > maxAttempts) {
      throw new Error('Deployment timed out waiting for READY state')
    }

    slog.debug('Deployment status event', { eventType: event.type, attempt, maxAttempts })

    if (event.type === 'ready') {
      slog.info('Deployment ready')
      return
    }

    if (event.type === 'error') {
      const errorPayload = event.payload as { message?: string } | undefined
      const errorMessage = errorPayload?.message ?? JSON.stringify(errorPayload)
      slog.error('Deployment error', { error: errorMessage })
      throw new Error(`Deployment failed: ${errorMessage}`)
    }

    if (event.type === 'canceled') {
      throw new Error('Deployment was canceled')
    }
  }

  throw new Error('Deployment status check ended without reaching READY state')
}

/**
 * Add a custom domain alias to the wildcard Vercel project.
 * Returns the full https URL for the custom domain.
 */
async function assignCustomDomain(domain: string, vercelProjectSlug: string): Promise<string> {
  const vercelToken = process.env.VERCEL_TOKEN
  if (!vercelToken) {
    throw new Error('VERCEL_TOKEN environment variable is required')
  }

  const teamId = process.env.VERCEL_TEAM_ID

  const response = await fetchWithTimeout(
    `https://api.vercel.com/v10/projects/${vercelProjectSlug}/domains${teamId ? `?teamId=${teamId}` : ''}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
    },
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to assign domain ${domain}: ${error}`)
  }

  return `https://${domain}`
}
