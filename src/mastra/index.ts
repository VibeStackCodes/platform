/**
 * Mastra entry point — required by `mastra dev` (Studio) and `mastra build` (Cloud).
 *
 * The Mastra instance MUST be created directly in this file (not re-exported)
 * so the Mastra Cloud deployer's static analysis can detect the configuration.
 * Agents and helpers are defined in lib/agents/registry.ts.
 */
import { Mastra } from '@mastra/core'
import { PinoLogger } from '@mastra/loggers'
import {
  analystAgent,
  backendAgent,
  dbaAgent,
  devOpsAgent,
  frontendAgent,
  getSharedStore,
  infraAgent,
  qaAgent,
  reviewerAgent,
  supervisorAgent,
} from '../../server/lib/agents/registry'
import { infraProvisionWorkflow } from '../../server/lib/agents/workflows'

export const mastra = new Mastra({
  agents: {
    supervisor: supervisorAgent,
    analyst: analystAgent,
    infraEngineer: infraAgent,
    databaseAdmin: dbaAgent,
    backendEngineer: backendAgent,
    frontendEngineer: frontendAgent,
    codeReviewer: reviewerAgent,
    qaEngineer: qaAgent,
    devOpsEngineer: devOpsAgent,
  },
  workflows: {
    infraProvision: infraProvisionWorkflow,
  },
  storage: getSharedStore() ?? undefined,
  logger: new PinoLogger({
    name: 'VibeStack',
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
})
