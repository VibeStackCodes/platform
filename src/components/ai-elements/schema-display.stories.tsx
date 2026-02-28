import type { Meta, StoryObj } from '@storybook/react'
import { SchemaDisplay } from './schema-display'

const meta = {
  title: 'AI/SchemaDisplay',
  component: SchemaDisplay,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SchemaDisplay>

export default meta
type Story = StoryObj<typeof meta>

export const GetEndpoint: Story = {
  args: {
    method: 'GET',
    path: '/api/users/{userId}',
    description: 'Retrieve a single user by their unique identifier.',
    parameters: [
      {
        name: 'userId',
        type: 'string',
        required: true,
        location: 'path',
        description: 'The UUID of the user to retrieve.',
      },
      {
        name: 'include',
        type: 'string',
        required: false,
        location: 'query',
        description: 'Comma-separated list of relations to include (e.g. profile,credits).',
      },
    ],
    responseBody: [
      {
        name: 'id',
        type: 'string',
        required: true,
        description: 'User UUID.',
      },
      {
        name: 'email',
        type: 'string',
        required: true,
        description: 'User email address.',
      },
      {
        name: 'profile',
        type: 'object',
        required: false,
        description: 'Nested profile object.',
        properties: [
          { name: 'displayName', type: 'string', required: true },
          { name: 'avatarUrl', type: 'string', required: false },
          { name: 'plan', type: 'string', required: true, description: '"free" or "pro"' },
        ],
      },
    ],
  },
}

export const PostEndpoint: Story = {
  args: {
    method: 'POST',
    path: '/api/projects',
    description: 'Create a new AI-generated project.',
    requestBody: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Project display name.',
      },
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description: 'Natural language description of the app to build.',
      },
      {
        name: 'model',
        type: 'string',
        required: false,
        description: 'LLM model to use. Defaults to gpt-5.2-codex.',
      },
    ],
    responseBody: [
      { name: 'id', type: 'string', required: true },
      { name: 'status', type: 'string', required: true },
      { name: 'createdAt', type: 'string', required: true },
    ],
  },
}

export const DeleteEndpoint: Story = {
  args: {
    method: 'DELETE',
    path: '/api/projects/{projectId}',
    description: 'Permanently delete a project and all associated sandbox resources.',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        required: true,
        location: 'path',
        description: 'Project UUID.',
      },
    ],
    responseBody: [
      { name: 'deleted', type: 'boolean', required: true },
      { name: 'id', type: 'string', required: true },
    ],
  },
}

export const PatchEndpoint: Story = {
  args: {
    method: 'PATCH',
    path: '/api/projects/{projectId}',
    description: 'Partially update a project.',
    parameters: [
      {
        name: 'projectId',
        type: 'string',
        required: true,
        location: 'path',
      },
    ],
    requestBody: [
      { name: 'name', type: 'string', required: false },
      { name: 'description', type: 'string', required: false },
    ],
    responseBody: [
      { name: 'id', type: 'string', required: true },
      { name: 'updatedAt', type: 'string', required: true },
    ],
  },
}

export const MinimalNoBody: Story = {
  args: {
    method: 'GET',
    path: '/api/health',
    description: 'Health check endpoint. Returns 200 if the server is running.',
    responseBody: [
      { name: 'status', type: 'string', required: true, description: '"ok" or "degraded"' },
    ],
  },
}

export const NestedResponseBody: Story = {
  args: {
    method: 'GET',
    path: '/api/projects/{projectId}/generation-state',
    description: 'Get the full generation state for a project, including nested sandbox and file data.',
    parameters: [
      { name: 'projectId', type: 'string', required: true, location: 'path' },
    ],
    responseBody: [
      { name: 'sandboxId', type: 'string', required: false },
      { name: 'githubRepo', type: 'string', required: false },
      {
        name: 'fileManifest',
        type: 'object',
        required: false,
        description: 'Map of file paths to their content hashes.',
      },
      {
        name: 'tokens',
        type: 'object',
        required: false,
        description: 'Design tokens used for the generated app.',
        properties: [
          { name: 'primaryColor', type: 'string', required: true },
          { name: 'accentColor', type: 'string', required: true },
          { name: 'fontFamily', type: 'string', required: true },
          {
            name: 'style',
            type: 'object',
            required: false,
            properties: [
              { name: 'borderRadius', type: 'string', required: false },
              { name: 'cardStyle', type: 'string', required: false },
            ],
          },
        ],
      },
    ],
  },
}
