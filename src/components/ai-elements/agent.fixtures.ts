import type { Tool } from 'ai'
import { jsonSchema } from 'ai'

export const writeFileTool: Tool = {
  description: 'Write content to a file in the sandbox workspace',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file to write',
      },
      content: {
        type: 'string',
        description: 'File content to write',
      },
    },
    required: ['path', 'content'],
  }),
}

export const runCommandTool: Tool = {
  description: 'Execute a shell command in the sandbox environment',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command (optional)',
      },
      timeout: {
        type: 'number',
        description: 'Maximum execution time in milliseconds (default: 30000)',
      },
    },
    required: ['command'],
  }),
}

export const webSearchTool: Tool = {
  description: 'Search the web for up-to-date information about packages, APIs, or documentation',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
    },
    required: ['query'],
  }),
}

export const sampleTools: Tool[] = [writeFileTool, runCommandTool, webSearchTool]

export const outputSchema = `{
  type: "object",
  properties: {
    success: { type: "boolean" },
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        }
      }
    },
    errors: {
      type: "array",
      items: { type: "string" }
    }
  }
}`
