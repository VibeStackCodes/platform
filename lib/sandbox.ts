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
 * Find an existing sandbox by project label.
 * Returns the first sandbox matching the project ID, or null.
 */
export async function findSandboxByProject(projectId: string): Promise<Sandbox | null> {
  const daytona = getDaytonaClient();
  try {
    const result = await daytona.list({ project: projectId }, 1, 1);
    if (result.items.length > 0) {
      const sandbox = await daytona.get(result.items[0].id);
      console.log(`✓ Found sandbox by project label: ${sandbox.id}`);
      return sandbox;
    }
    return null;
  } catch (error) {
    console.warn(`[sandbox] findSandboxByProject failed:`, error);
    return null;
  }
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
  const { cwd, env: _env, async: isAsync = false, timeout = 300 } = options;

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
    // Note: env vars are not supported via SessionExecuteRequest - set them at sandbox level
    const response = await sandbox.process.executeSessionCommand(
      sessionId,
      {
        command,
        async: isAsync,
      },
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

// ============================================================================
// Dev Server Management
// ============================================================================

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
 * Get the preview link URL for the code server (OpenVSCode on port 13337).
 * Requires sandbox created with public: true.
 */
export async function getCodeServerLink(sandbox: Sandbox): Promise<string> {
  const link = await sandbox.getPreviewLink(13337);
  return link.url;
}

/**
 * Wait for an already-running dev server and return its preview URL.
 */
export async function waitForDevServer(sandbox: Sandbox): Promise<{ url: string }> {
  await waitForServerReady(sandbox, 3000, 30);
  const preview = await getPreviewUrl(sandbox, 3000);
  return { url: preview.url };
}

/**
 * Wait for the code server (OpenVSCode Server) to be ready on port 13337.
 */
export async function waitForCodeServer(sandbox: Sandbox, maxAttempts: number = 15): Promise<void> {
  await waitForServerReady(sandbox, 13337, maxAttempts);
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
  // Add remote (shell command — no SDK method for remote add)
  await runCommand(
    sandbox,
    `git remote add origin ${cloneUrl}`,
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

  // Push using Daytona's native git module with token auth
  await sandbox.git.push(workDir, 'x-access-token', token);
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

