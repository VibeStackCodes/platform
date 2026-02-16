import { assign, setup } from 'xstate'
import type { AppBlueprint } from '../app-blueprint'
import type { DesignPreferences, SchemaContract } from '../schema-contract'
import type { ValidationGateResult } from './validation'

// ============================================================================
// Context type — all data flowing through the machine
// ============================================================================

export interface MachineContext {
  // Input
  userMessage: string
  projectId: string

  // Analyst output
  appName: string
  appDescription: string
  contract: SchemaContract | null
  designPreferences: DesignPreferences | null

  // Clarification
  clarificationQuestions: unknown[] | null

  // Blueprint
  blueprint: AppBlueprint | null

  // Infrastructure
  sandboxId: string | null
  supabaseProjectId: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  githubCloneUrl: string | null
  githubHtmlUrl: string | null
  repoName: string | null

  // Validation
  validation: ValidationGateResult | null
  retryCount: number

  // Deploy
  deploymentUrl: string | null

  // Error
  error: string | null
}

// ============================================================================
// Event types
// ============================================================================

type MachineEvent =
  | { type: 'START'; userMessage: string; projectId: string }
  | { type: 'USER_ANSWERED'; answers: string }
  | {
      type: 'ANALYST_DONE'
      appName: string
      appDescription: string
      contract: SchemaContract
      designPreferences: DesignPreferences
    }
  | { type: 'CLARIFICATION_NEEDED'; questions: unknown[] }
  | { type: 'BLUEPRINT_DONE'; blueprint: AppBlueprint }
  | {
      type: 'PROVISION_DONE'
      sandboxId: string
      supabaseProjectId: string
      supabaseUrl: string
      supabaseAnonKey: string
      githubCloneUrl: string
      githubHtmlUrl: string
      repoName: string
    }
  | { type: 'SCAFFOLD_DONE' }
  | { type: 'CODEGEN_DONE' }
  | { type: 'VALIDATION_PASS' }
  | { type: 'VALIDATION_FAIL'; validation: ValidationGateResult }
  | { type: 'REPAIR_DONE' }
  | { type: 'DEPLOY_DONE'; deploymentUrl: string }
  | { type: 'ERROR'; error: string }

// ============================================================================
// Machine definition
// ============================================================================

export const appGenerationMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as MachineEvent,
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < 2,
    cannotRetry: ({ context }) => context.retryCount >= 2,
  },
}).createMachine({
  id: 'appGeneration',
  initial: 'idle',
  context: {
    userMessage: '',
    projectId: '',
    appName: '',
    appDescription: '',
    contract: null,
    designPreferences: null,
    clarificationQuestions: null,
    blueprint: null,
    sandboxId: null,
    supabaseProjectId: null,
    supabaseUrl: null,
    supabaseAnonKey: null,
    githubCloneUrl: null,
    githubHtmlUrl: null,
    repoName: null,
    validation: null,
    retryCount: 0,
    deploymentUrl: null,
    error: null,
  },
  states: {
    idle: {
      on: {
        START: {
          target: 'analyzing',
          actions: assign({
            userMessage: ({ event }) => event.userMessage,
            projectId: ({ event }) => event.projectId,
          }),
        },
      },
    },

    analyzing: {
      on: {
        ANALYST_DONE: {
          target: 'blueprinting',
          actions: assign({
            appName: ({ event }) => event.appName,
            appDescription: ({ event }) => event.appDescription,
            contract: ({ event }) => event.contract,
            designPreferences: ({ event }) => event.designPreferences,
          }),
        },
        CLARIFICATION_NEEDED: {
          target: 'awaitingClarification',
          actions: assign({
            clarificationQuestions: ({ event }) => event.questions,
          }),
        },
        ERROR: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    awaitingClarification: {
      on: {
        USER_ANSWERED: {
          target: 'analyzing',
          actions: assign({
            userMessage: ({ context, event }) =>
              `${context.userMessage}\n\nUser's answers:\n${event.answers}`,
          }),
        },
      },
    },

    blueprinting: {
      on: {
        BLUEPRINT_DONE: {
          target: 'provisioning',
          actions: assign({
            blueprint: ({ event }) => event.blueprint,
          }),
        },
        ERROR: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    provisioning: {
      on: {
        PROVISION_DONE: {
          target: 'generating',
          actions: assign({
            sandboxId: ({ event }) => event.sandboxId,
            supabaseProjectId: ({ event }) => event.supabaseProjectId,
            supabaseUrl: ({ event }) => event.supabaseUrl,
            supabaseAnonKey: ({ event }) => event.supabaseAnonKey,
            githubCloneUrl: ({ event }) => event.githubCloneUrl,
            githubHtmlUrl: ({ event }) => event.githubHtmlUrl,
            repoName: ({ event }) => event.repoName,
          }),
        },
        ERROR: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    generating: {
      on: {
        CODEGEN_DONE: 'validating',
        ERROR: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    validating: {
      on: {
        VALIDATION_PASS: 'deploying',
        VALIDATION_FAIL: [
          {
            guard: 'canRetry',
            target: 'repairing',
            actions: assign({
              validation: ({ event }) => event.validation,
              retryCount: ({ context }) => context.retryCount + 1,
            }),
          },
          {
            guard: 'cannotRetry',
            target: 'failed',
            actions: assign({
              error: () => 'Validation failed after maximum retries',
            }),
          },
        ],
        ERROR: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    repairing: {
      on: {
        REPAIR_DONE: 'validating',
        ERROR: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    deploying: {
      on: {
        DEPLOY_DONE: {
          target: 'complete',
          actions: assign({
            deploymentUrl: ({ event }) => event.deploymentUrl,
          }),
        },
        ERROR: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    complete: {
      type: 'final',
    },

    failed: {
      type: 'final',
    },
  },
})
