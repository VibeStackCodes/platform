/**
 * Mastra Workflows — deterministic, structured pipelines for tasks that don't need LLM reasoning.
 *
 * Unlike agent networks (LLM-driven routing), workflows execute steps in a fixed order
 * with typed inputs/outputs. Use workflows for infrastructure provisioning, data pipelines,
 * and other deterministic sequences.
 *
 * Visible in Mastra Studio under the "Workflows" tab.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { createSandbox as createSandboxFn } from '../sandbox';
import { createRepo, buildRepoName } from '../github';
import { createSupabaseProject as createSupabaseProjectFn } from '../supabase-mgmt';

// --- Step 1: Create Daytona sandbox ---

const createSandboxStep = createStep({
  id: 'create-sandbox',
  inputSchema: z.object({
    appName: z.string(),
    projectId: z.string(),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    projectId: z.string(),
  }),
  execute: async ({ inputData }) => {
    const sandbox = await createSandboxFn({
      language: 'typescript',
      autoStopInterval: 60,
      labels: { app: inputData.appName, project: inputData.projectId },
    });
    return {
      sandboxId: sandbox.id,
      appName: inputData.appName,
      projectId: inputData.projectId,
    };
  },
});

// --- Step 2: Create Supabase project ---

const createSupabaseStep = createStep({
  id: 'create-supabase',
  inputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    projectId: z.string(),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    projectId: z.string(),
    supabaseProjectId: z.string(),
    supabaseUrl: z.string(),
    supabaseAnonKey: z.string(),
  }),
  execute: async ({ inputData }) => {
    const project = await createSupabaseProjectFn(inputData.appName, 'us-east-1');
    return {
      sandboxId: inputData.sandboxId,
      appName: inputData.appName,
      projectId: inputData.projectId,
      supabaseProjectId: project.id,
      supabaseUrl: project.url,
      supabaseAnonKey: project.anonKey,
    };
  },
});

// --- Step 3: Create GitHub repository ---

const createGitHubRepoStep = createStep({
  id: 'create-github-repo',
  inputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    projectId: z.string(),
    supabaseProjectId: z.string(),
    supabaseUrl: z.string(),
    supabaseAnonKey: z.string(),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    supabaseProjectId: z.string(),
    supabaseUrl: z.string(),
    supabaseAnonKey: z.string(),
    githubCloneUrl: z.string(),
    githubHtmlUrl: z.string(),
    repoName: z.string(),
  }),
  execute: async ({ inputData }) => {
    const repoName = buildRepoName(inputData.appName, inputData.projectId);
    const repo = await createRepo(repoName);
    return {
      sandboxId: inputData.sandboxId,
      supabaseProjectId: inputData.supabaseProjectId,
      supabaseUrl: inputData.supabaseUrl,
      supabaseAnonKey: inputData.supabaseAnonKey,
      githubCloneUrl: repo.cloneUrl,
      githubHtmlUrl: repo.htmlUrl,
      repoName,
    };
  },
});

// --- Composed workflow ---

export const infraProvisionWorkflow = createWorkflow({
  id: 'infra-provision',
  inputSchema: z.object({
    appName: z.string().describe('Application name for the generated project'),
    projectId: z.string().describe('VibeStack project ID'),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    supabaseProjectId: z.string(),
    supabaseUrl: z.string(),
    supabaseAnonKey: z.string(),
    githubCloneUrl: z.string(),
    githubHtmlUrl: z.string(),
    repoName: z.string(),
  }),
})
  .then(createSandboxStep)
  .then(createSupabaseStep)
  .then(createGitHubRepoStep)
  .commit();
