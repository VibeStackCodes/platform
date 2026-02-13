import { Daytona, Sandbox } from '@daytonaio/sdk';

/**
 * Daytona Sandbox Wrapper
 *
 * Provides type-safe functions for managing Daytona sandboxes:
 * - Sandbox lifecycle (create, destroy)
 * - File operations (upload single/multiple files)
 * - Command execution (session-based for background processes)
 * - Dev server management (init, logs, preview URLs)
 */

// ============================================================================
// Types
// ============================================================================

export interface SandboxConfig {
  language?: 'typescript' | 'javascript' | 'python';
  envVars?: Record<string, string>;
  autoStopInterval?: number; // minutes
  labels?: Record<string, string>;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr?: string;
}

export interface PreviewUrlResult {
  url: string;
  port: number;
  expiresAt: Date;
}

// ============================================================================
// Singleton Daytona Client
// ============================================================================

let daytonaClient: Daytona | null = null;

export function getDaytonaClient(): Daytona {
  if (!daytonaClient) {
    const apiKey = process.env.DAYTONA_API_KEY;
    if (!apiKey) {
      throw new Error('DAYTONA_API_KEY environment variable is required');
    }

    daytonaClient = new Daytona({
      apiKey,
      apiUrl: 'https://app.daytona.io/api',
      _experimental: {},
    });
  }

  return daytonaClient;
}

/**
 * Get an existing sandbox by ID
 */
export async function getSandbox(sandboxId: string): Promise<Sandbox> {
  const daytona = getDaytonaClient();
  try {
    const sandbox = await daytona.get(sandboxId);
    console.log(`✓ Retrieved sandbox: ${sandbox.id}`);
    return sandbox;
  } catch (error) {
    throw new Error(`Failed to get sandbox ${sandboxId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Sandbox Creation
// ============================================================================

/**
 * Create a new Daytona sandbox
 */
export async function createSandbox(config: SandboxConfig = {}): Promise<Sandbox> {
  const daytona = getDaytonaClient();

  try {
    const snapshotId = process.env.DAYTONA_SNAPSHOT_ID;
    if (!snapshotId) {
      throw new Error('DAYTONA_SNAPSHOT_ID environment variable is required');
    }

    const sandbox = await daytona.create({
      language: config.language || 'typescript',
      envVars: config.envVars || {},
      autoStopInterval: config.autoStopInterval || 60, // 1 hour default
      labels: config.labels || {},
      ephemeral: false,
      snapshot: snapshotId,
    }, {
      timeout: 60, // 60 second creation timeout
    });

    console.log(`✓ Sandbox created: ${sandbox.id} (from snapshot: ${snapshotId})`);
    return sandbox;
  } catch (error) {
    console.error('Failed to create sandbox:', error);
    throw new Error(`Sandbox creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Upload a single file to the sandbox
 */
export async function uploadFile(
  sandbox: Sandbox,
  content: string | Buffer,
  remotePath: string
): Promise<void> {
  try {
    const buffer = typeof content === 'string' ? Buffer.from(content) : content;
    await sandbox.fs.uploadFile(buffer, remotePath);
    console.log(`✓ Uploaded: ${remotePath}`);
  } catch (error) {
    throw new Error(`Failed to upload ${remotePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Upload multiple files to the sandbox
 */
export async function uploadFiles(
  sandbox: Sandbox,
  files: Array<{ content: string | Buffer; path: string }>
): Promise<void> {
  try {
    await Promise.all(
      files.map(file => uploadFile(sandbox, file.content, file.path))
    );
    console.log(`✓ Uploaded ${files.length} files`);
  } catch (error) {
    throw new Error(`Failed to upload files: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Command Execution (Session-based)
// ============================================================================

/**
 * Execute a command in the sandbox using session-based API
 *
 * CRITICAL: Uses session-based execution to properly handle background processes.
 * The regular executeCommand() with timeout=0 does NOT work for background servers.
 */
export async function runCommand(
  sandbox: Sandbox,
  command: string,
  sessionId: string,
  options: {
    cwd?: string;
    env?: Record<string, string>;
    async?: boolean;
    timeout?: number;
  } = {}
): Promise<CommandResult> {
  const { cwd, env, async: isAsync = false, timeout = 300 } = options;

  try {
    // Create session if it doesn't exist
    try {
      await sandbox.process.createSession(sessionId);
      console.log(`✓ Created session: ${sessionId}`);
    } catch (error) {
      // Session might already exist, that's ok
      const errMsg = error instanceof Error ? error.message : String(error);
      if (!errMsg.includes('already exists')) {
        throw error;
      }
    }

    // Execute command in session
    const response = await sandbox.process.executeSessionCommand(
      sessionId,
      {
        command,
        var: env,
        async: isAsync,
      } as any,
      timeout
    );

    return {
      exitCode: response.exitCode || 0,
      stdout: response.stdout || '',
      stderr: response.stderr,
    };
  } catch (error) {
    throw new Error(`Command execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Dev Server Management
// ============================================================================

/**
 * Initialize a generated Next.js app in the sandbox
 * - Uploads generated files
 * - Installs dependencies
 * - Starts dev server in background
 */
export async function initGeneratedApp(
  sandbox: Sandbox,
  files: Array<{ content: string; path: string }>,
  workDir: string = '/workspace'
): Promise<void> {
  try {
    // 1. Upload all generated files
    console.log('Uploading generated files...');
    await uploadFiles(sandbox, files);

    // 2. Initialize git repo (no SDK equivalent for git init)
    console.log('Initializing git...');
    await runCommand(
      sandbox,
      'git init && git config user.email "vibestack@generated.app" && git config user.name "VibeStack"',
      'git-init',
      { cwd: workDir, timeout: 30 }
    );

    // 3. Deps pre-installed in snapshot — skip install

    // 4. Stage all files and commit using Daytona SDK
    console.log('Staging and committing files...');
    await sandbox.git.add(workDir, ['.']);
    await sandbox.git.commit(
      workDir,
      'chore: initial project scaffolding',
      'VibeStack',
      'vibestack@generated.app',
    );

    // 5. Start dev server in background (async mode)
    console.log('Starting dev server...');
    await runCommand(
      sandbox,
      'bun run dev',
      'dev-server',
      { cwd: workDir, async: true, timeout: 0 }
    );

    // 6. Wait for server to be ready (poll port 3000)
    await waitForServerReady(sandbox, 3000, 30);

    console.log('✓ Generated app initialized and running');
  } catch (error) {
    throw new Error(`Failed to initialize app: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Wait for server to be ready by polling HTTP endpoint
 */
async function waitForServerReady(
  sandbox: Sandbox,
  port: number,
  maxAttempts: number = 30
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await sandbox.process.executeCommand(
        `curl -f -s -o /dev/null -w "%{http_code}" http://localhost:${port} || echo "000"`,
        '/workspace',
        undefined,
        5
      );

      const httpCode = result.result.trim();

      // Any HTTP response (200, 404, etc.) indicates server is ready
      if (httpCode !== "000" && httpCode !== "") {
        console.log(`✓ Server ready on port ${port} (HTTP ${httpCode})`);
        return;
      }
    } catch {
      // Ignore errors, keep polling
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(`Server not ready after ${maxAttempts} attempts`);
}

/**
 * Get dev server logs from session
 */
export async function getDevServerLogs(
  sandbox: Sandbox,
  sessionId: string = 'dev-server',
  commandId: string
): Promise<{ stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';

  try {
    await sandbox.process.getSessionCommandLogs(
      sessionId,
      commandId,
      (chunk: string) => { stdout += chunk; },
      (chunk: string) => { stderr += chunk; }
    );

    return { stdout, stderr };
  } catch (error) {
    throw new Error(`Failed to get logs: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get preview URL for a port in the sandbox
 * Returns a signed URL valid for 1 hour
 */
export async function getPreviewUrl(
  sandbox: Sandbox,
  port: number = 3000
): Promise<PreviewUrlResult> {
  try {
    const expiresInSeconds = 3600; // 1 hour
    const preview = await sandbox.getSignedPreviewUrl(port, expiresInSeconds);

    return {
      url: preview.url,
      port,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  } catch (error) {
    throw new Error(`Failed to get preview URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Start the Vite dev server in the background.
 * Returns preview URL immediately — HMR will pick up file changes.
 */
export async function startDevServer(
  sandbox: Sandbox,
  workDir: string = '/workspace'
): Promise<{ url: string }> {
  // Start dev server in background (async mode, no timeout)
  runCommand(sandbox, 'bun run dev', 'dev-server', {
    cwd: workDir,
    async: true,
    timeout: 0
  }).catch(() => {
    // Dev server runs forever — errors are expected when sandbox shuts down
  });

  // Wait for server to start (poll port 3000)
  await waitForServerReady(sandbox, 3000, 30);

  // Get preview URL
  const preview = await getPreviewUrl(sandbox, 3000);
  return { url: preview.url };
}

// ============================================================================
// GitHub Push
// ============================================================================

/**
 * Push the sandbox's git repo to a GitHub remote.
 * Uses Daytona's native sandbox.git.push() with PAT auth.
 */
export async function pushToGitHub(
  sandbox: Sandbox,
  cloneUrl: string,
  token: string,
  workDir: string = '/workspace'
): Promise<void> {
  // Build authenticated URL: https://x-access-token:TOKEN@github.com/org/repo.git
  const authedUrl = cloneUrl.replace('https://', `https://x-access-token:${token}@`);

  // Add remote with embedded auth token
  await runCommand(
    sandbox,
    `git remote add origin ${authedUrl}`,
    'git-remote-add',
    { cwd: workDir, timeout: 15 }
  );

  // Rename default branch to main (sandbox git init creates 'master')
  await runCommand(
    sandbox,
    'git branch -M main',
    'git-rename-branch',
    { cwd: workDir, timeout: 10 }
  );

  // Push via shell git (Daytona's native git.push can fail silently)
  await runCommand(
    sandbox,
    'git push -u origin main',
    'git-push',
    { cwd: workDir, timeout: 60 }
  );

  console.log(`✓ Git push to ${cloneUrl} completed`);
}

// ============================================================================
// File Download
// ============================================================================

/**
 * Download a single file from the sandbox
 */
export async function downloadFile(
  sandbox: Sandbox,
  remotePath: string
): Promise<Buffer> {
  try {
    const content = await sandbox.fs.downloadFile(remotePath);
    console.log(`✓ Downloaded: ${remotePath}`);
    return content;
  } catch (error) {
    throw new Error(`Failed to download ${remotePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Download all files from a directory recursively
 */
export async function downloadDirectory(
  sandbox: Sandbox,
  remotePath: string = '/workspace'
): Promise<Array<{ path: string; content: Buffer }>> {
  try {
    // List all files recursively using find command
    const listResult = await sandbox.process.executeCommand(
      `find ${remotePath} -type f ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/.git/*"`,
      remotePath,
      undefined,
      30
    );

    if (listResult.exitCode !== 0) {
      throw new Error(`Failed to list files: ${listResult.result}`);
    }

    const filePaths = listResult.result
      .split('\n')
      .filter(p => p.trim() !== '')
      .map(p => p.trim());

    console.log(`Found ${filePaths.length} files to download`);

    // Download all files in parallel
    const files = await Promise.all(
      filePaths.map(async (filePath) => {
        const content = await downloadFile(sandbox, filePath);
        // Make path relative to workspace
        const relativePath = filePath.replace(new RegExp(`^${remotePath}/?`), '');
        return {
          path: relativePath || filePath,
          content,
        };
      })
    );

    console.log(`✓ Downloaded ${files.length} files from ${remotePath}`);
    return files;
  } catch (error) {
    throw new Error(`Failed to download directory: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Early Provisioning
// ============================================================================

/**
 * Provision sandbox + Supabase project in background.
 * Called fire-and-forget from chat route on first message.
 * Creates with short autoStopInterval (10min) — abandoned sandboxes self-destruct.
 */
export async function provisionProject(
  projectId: string,
  appName: string,
  supabaseClient: any,
): Promise<void> {
  try {
    // Only pre-provision sandbox — Supabase project is created by the generate route
    // (avoids double-creation which hits the free tier 2-project limit)
    const sandbox = await createSandbox({
      language: 'typescript',
      autoStopInterval: 60,
      labels: { project: projectId, app: appName, type: 'vibestack-generated' },
    });

    await supabaseClient
      .from('projects')
      .update({ sandbox_id: sandbox.id })
      .eq('id', projectId);

    console.log(`✓ Sandbox pre-provisioned: ${sandbox.id}`);
  } catch (error) {
    console.error(`[provisionProject] Failed for ${projectId}:`, error);
    // Don't throw — this is fire-and-forget. Generation route will create its own if needed.
  }
}

// ============================================================================
// Sandbox Destruction
// ============================================================================

/**
 * Destroy a sandbox and clean up all resources
 */
export async function destroySandbox(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.delete(30); // 30 second timeout
    console.log(`✓ Sandbox destroyed: ${sandbox.id}`);
  } catch (error) {
    console.error(`Failed to destroy sandbox ${sandbox.id}:`, error);
    throw new Error(`Sandbox destruction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
