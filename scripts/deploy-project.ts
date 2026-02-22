/**
 * One-off script to deploy a project to Vercel from its Daytona sandbox.
 *
 * Usage: bun run scripts/deploy-project.ts <projectId>
 *
 * Builds in sandbox, downloads dist/, uploads to Vercel.
 */

import 'dotenv/config'
import { getDaytonaClient, runCommand, downloadDirectory } from '../server/lib/sandbox'
import { fetchWithTimeout } from '../server/lib/fetch'
import { buildAppSlug } from '../server/lib/slug'

const projectId = process.argv[2]
if (!projectId) {
  console.error('Usage: bun run scripts/deploy-project.ts <projectId>')
  process.exit(1)
}

const vercelToken = process.env.VERCEL_TOKEN
const teamId = process.env.VERCEL_TEAM_ID
if (!vercelToken) {
  console.error('VERCEL_TOKEN is required')
  process.exit(1)
}

async function main() {
  // 1. Get project from DB
  console.log(`[deploy] Fetching project ${projectId}...`)
  // Use a raw query since getProject requires userId
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const pg = await import('pg')
  const { projects } = await import('../server/lib/db/schema')
  const { eq } = await import('drizzle-orm')

  const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool)

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)

  if (!project) {
    console.error(`Project ${projectId} not found`)
    process.exit(1)
  }

  console.log(`[deploy] Project: "${project.name}", sandbox: ${project.sandboxId}, status: ${project.status}`)

  if (!project.sandboxId) {
    console.error('Project has no sandbox')
    process.exit(1)
  }

  // 2. Get sandbox
  console.log(`[deploy] Connecting to sandbox ${project.sandboxId}...`)
  const daytona = getDaytonaClient()
  const sandbox = await daytona.get(project.sandboxId)
  console.log(`[deploy] Sandbox connected`)

  // 3. Build in sandbox
  console.log(`[deploy] Running production build in sandbox...`)

  // Write .env.production with whatever Supabase vars we have (may be empty for local-only apps)
  const envContent = [
    project.supabaseUrl ? `VITE_SUPABASE_URL=${project.supabaseUrl}` : '',
    project.supabaseAnonKey ? `VITE_SUPABASE_ANON_KEY=${project.supabaseAnonKey}` : '',
  ].filter(Boolean).join('\n')

  if (envContent) {
    await sandbox.fs.uploadFile(Buffer.from(envContent + '\n'), '/workspace/.env.production')
  }

  const buildResult = await runCommand(sandbox, 'cd /workspace && bun run build', 'prod-build', {
    cwd: '/workspace',
    timeout: 120,
  })

  if (buildResult.exitCode !== 0) {
    console.error(`[deploy] Build failed:\n${buildResult.stdout}\n${buildResult.stderr || ''}`)
    process.exit(1)
  }

  console.log(`[deploy] Build succeeded`)

  // 4. Download dist/
  console.log(`[deploy] Downloading dist/ from sandbox...`)
  const files = await downloadDirectory(sandbox, '/workspace/dist')
  console.log(`[deploy] Downloaded ${files.length} files`)

  // 5. Deploy to Vercel
  console.log(`[deploy] Deploying to Vercel...`)
  const slug = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  const vercelFiles = files.map((f) => ({
    file: f.path,
    data: f.content.toString('base64'),
    encoding: 'base64',
  }))

  const deployResponse = await fetchWithTimeout(
    `https://api.vercel.com/v13/deployments${teamId ? `?teamId=${teamId}` : ''}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: slug,
        files: vercelFiles,
        projectSettings: {
          framework: null, // Pre-built, no build needed
          buildCommand: '',
          outputDirectory: '.',
        },
        target: 'production',
      }),
    },
  )

  if (!deployResponse.ok) {
    const error = await deployResponse.text()
    console.error(`[deploy] Vercel deployment failed: ${error}`)
    process.exit(1)
  }

  const deployment = await deployResponse.json() as { id: string; url: string; readyState: string }
  let deployUrl = `https://${deployment.url}`
  console.log(`[deploy] Deployment created: ${deployUrl} (${deployment.id})`)

  // 6. Poll until ready
  console.log(`[deploy] Waiting for deployment to be ready...`)
  for (let i = 0; i < 60; i++) {
    const statusRes = await fetchWithTimeout(
      `https://api.vercel.com/v13/deployments/${deployment.id}${teamId ? `?teamId=${teamId}` : ''}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } },
    )
    const status = await statusRes.json() as { readyState: string; url: string }
    console.log(`[deploy] Status: ${status.readyState} (attempt ${i + 1}/60)`)

    if (status.readyState === 'READY') {
      console.log(`[deploy] Deployment ready!`)
      break
    }
    if (status.readyState === 'ERROR' || status.readyState === 'CANCELED') {
      console.error(`[deploy] Deployment failed: ${status.readyState}`)
      process.exit(1)
    }
    await new Promise((r) => setTimeout(r, 5000))
  }

  // 7. Assign custom domain if configured
  const wildcardDomain = process.env.VERCEL_WILDCARD_DOMAIN
  if (wildcardDomain) {
    const appSlug = buildAppSlug(project.name, projectId)
    const customDomain = `${appSlug}.${wildcardDomain}`
    console.log(`[deploy] Assigning custom domain: ${customDomain}`)

    const domainRes = await fetchWithTimeout(
      `https://api.vercel.com/v10/projects/${slug}/domains${teamId ? `?teamId=${teamId}` : ''}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: customDomain }),
      },
    )

    if (domainRes.ok) {
      deployUrl = `https://${customDomain}`
      console.log(`[deploy] Custom domain assigned: ${deployUrl}`)
    } else {
      console.warn(`[deploy] Custom domain failed: ${await domainRes.text()}`)
    }
  }

  // 8. Update project in DB
  await db.update(projects).set({
    deployUrl,
    status: 'deployed',
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId))

  console.log(`\n✅ Deployed successfully!`)
  console.log(`   URL: ${deployUrl}`)

  await pool.end()
}

main().catch((err) => {
  console.error('[deploy] Fatal error:', err)
  process.exit(1)
})
