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
  frontendAgent,
  repairAgent,
} from '../../server/lib/agents/registry'

export const mastra = new Mastra({
  agents: {
    analyst: analystAgent,
    frontendEngineer: frontendAgent,
    repair: repairAgent,
  },
  logger: new PinoLogger({
    name: 'VibeStack',
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
})
