import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Sandbox } from '@daytonaio/sdk';

/**
 * Create sandbox tools for Mastra agents
 *
 * Factory function that creates tool definitions bound to a specific sandbox instance.
 * Used by code-producing agents (data architect, frontend engineer, QA engineer).
 *
 * @param sandbox - Daytona sandbox instance
 * @returns Object containing write-file, read-file, run-build, and run-lint tools
 */
export function createSandboxTools(sandbox: Sandbox) {
  const writeFile = createTool({
    id: 'write-file',
    description: 'Upload a file to the sandbox workspace',
    inputSchema: z.object({
      path: z.string().describe('File path relative to /workspace'),
      content: z.string().describe('File content'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      path: z.string(),
      linesOfCode: z.number(),
    }),
    execute: async (inputData, context) => {
      const fullPath = `/workspace/${inputData.path}`;
      await sandbox.fs.uploadFile(Buffer.from(inputData.content), fullPath);
      const linesOfCode = inputData.content.split('\n').length;
      return {
        success: true,
        path: fullPath,
        linesOfCode,
      };
    },
  });

  const readFile = createTool({
    id: 'read-file',
    description: 'Download a file from the sandbox workspace',
    inputSchema: z.object({
      path: z.string().describe('File path relative to /workspace'),
    }),
    outputSchema: z.object({
      content: z.string(),
      exists: z.boolean(),
    }),
    execute: async (inputData, context) => {
      const fullPath = `/workspace/${inputData.path}`;
      try {
        const buffer = await sandbox.fs.downloadFile(fullPath);
        return {
          content: buffer.toString('utf-8'),
          exists: true,
        };
      } catch {
        return {
          content: '',
          exists: false,
        };
      }
    },
  });

  const runBuild = createTool({
    id: 'run-build',
    description: 'Run bun run build in the sandbox',
    inputSchema: z.object({}),
    outputSchema: z.object({
      exitCode: z.number(),
      output: z.string(),
    }),
    execute: async (inputData, context) => {
      const result = await sandbox.process.executeCommand(
        'bun run build',
        '/workspace',
        undefined,
        120
      );
      return {
        exitCode: result.exitCode,
        output: result.result,
      };
    },
  });

  const runLint = createTool({
    id: 'run-lint',
    description: 'Run oxlint --fix in the sandbox',
    inputSchema: z.object({}),
    outputSchema: z.object({
      exitCode: z.number(),
      output: z.string(),
    }),
    execute: async (inputData, context) => {
      const result = await sandbox.process.executeCommand(
        'oxlint --fix',
        '/workspace',
        undefined,
        30
      );
      return {
        exitCode: result.exitCode,
        output: result.result,
      };
    },
  });

  return {
    writeFile,
    readFile,
    runBuild,
    runLint,
  };
}
