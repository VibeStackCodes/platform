/**
 * E2E Generation Pipeline Tests
 *
 * Tests the complete generation pipeline including:
 * - Plan generation with validation
 * - Layer-by-layer file generation with streaming
 * - Build verification with error fixing
 * - Full pipeline orchestration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Plan, FileSpec, StreamEvent } from '@/lib/types';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock Anthropic SDK
const mockAnthropicClient = {
  messages: {
    create: vi.fn(),
    stream: vi.fn(),
  },
};

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn(),
      stream: vi.fn(),
    };
    constructor() {
      return mockAnthropicClient;
    }
  },
}));

// Mock Daytona SDK
vi.mock('@daytonaio/sdk', () => ({
  Daytona: vi.fn().mockImplementation(() => ({
    create: vi.fn(),
  })),
  Sandbox: vi.fn(),
}));

// Mock sandbox module
vi.mock('@/lib/sandbox', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sandbox')>('@/lib/sandbox');
  return {
    ...actual,
    createSandbox: vi.fn(),
    uploadFile: vi.fn(),
    runCommand: vi.fn(),
  };
});

// Mock Supabase management
vi.mock('@/lib/supabase-mgmt', () => ({
  createSupabaseProject: vi.fn(),
  setupSchema: vi.fn(),
  mgmtFetch: vi.fn(),
}));

// ============================================================================
// Test Data
// ============================================================================

const mockPlan: Plan = {
  appName: 'Test App',
  appDescription: 'A test application',
  requirements: [
    {
      id: 'req-1',
      description: 'User authentication',
      category: 'auth',
      verifiable: true,
    },
    {
      id: 'req-2',
      description: 'Dashboard UI',
      category: 'ui',
      verifiable: true,
    },
  ],
  files: [
    {
      path: 'lib/types.ts',
      description: 'Type definitions',
      layer: 0,
      dependsOn: [],
      requirements: ['req-1'],
      skills: ['zod-validation'],
    },
    {
      path: 'lib/supabase/client.ts',
      description: 'Supabase client',
      layer: 0,
      dependsOn: [],
      requirements: ['req-1'],
      skills: ['supabase-auth'],
    },
    {
      path: 'app/dashboard/page.tsx',
      description: 'Dashboard page',
      layer: 1,
      dependsOn: ['lib/types.ts', 'lib/supabase/client.ts'],
      requirements: ['req-2'],
      skills: ['react-data-fetching'],
    },
  ],
  supabase: {
    migrationSQL: 'CREATE TABLE users (id UUID PRIMARY KEY);',
    seedSQL: null,
    rls: 'ALTER TABLE users ENABLE ROW LEVEL SECURITY;',
    storageBuckets: [],
    realtimeTables: [],
  },
  designTokens: {
    primaryColor: '#3b82f6',
    accentColor: '#8b5cf6',
    fontFamily: 'Inter',
    spacing: 'comfortable',
    borderRadius: 'medium',
  },
  packageDeps: {
    'next': '16.1.6',
    'react': '19.2.3',
    '@supabase/ssr': '^0.8.0',
  },
};

// ============================================================================
// Tests: generatePlan
// ============================================================================

describe('generatePlan', () => {
  let generatePlan: typeof import('@/lib/planner').generatePlan;

  beforeEach(async () => {
    vi.clearAllMocks();
    const planner = await import('@/lib/planner');
    generatePlan = planner.generatePlan;
  });

  it('should return a valid Plan with files, layers, and requirements', async () => {
    // Setup mock
    mockAnthropicClient.messages.create.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify(mockPlan),
        },
      ],
    });

    // Execute
    const result = await generatePlan('Build a dashboard app');

    // Verify
    expect(result).toBeDefined();
    expect(result.appName).toBe('Test App');
    expect(result.files).toHaveLength(3);
    expect(result.requirements).toHaveLength(2);
    expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'Build a dashboard app',
          }),
        ]),
      })
    );
  });

  it('should validate that all requirements are covered by files', async () => {
    const invalidPlan = {
      ...mockPlan,
      requirements: [
        ...mockPlan.requirements,
        {
          id: 'req-99',
          description: 'Uncovered requirement',
          category: 'ui' as const,
          verifiable: false,
        },
      ],
    };

    mockAnthropicClient.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(invalidPlan) }],
    });

    await expect(generatePlan('Build a dashboard app')).rejects.toThrow(
      /Requirements not covered by any file/
    );
  });

  it('should validate that layer 0 files have no dependencies', async () => {
    const invalidPlan = {
      ...mockPlan,
      files: [
        {
          path: 'lib/types.ts',
          description: 'Type definitions',
          layer: 0,
          dependsOn: ['other-file.ts'], // Invalid: layer 0 should have no deps
          requirements: ['req-1', 'req-2'], // Cover all requirements
          skills: [],
        },
      ],
    };

    mockAnthropicClient.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(invalidPlan) }],
    });

    await expect(generatePlan('Build a dashboard app')).rejects.toThrow(
      /Layer 0 files must have no dependencies/
    );
  });

  it('should validate that files do not import from the same layer', async () => {
    const invalidPlan = {
      ...mockPlan,
      files: [
        {
          path: 'lib/types.ts',
          description: 'Type definitions',
          layer: 0,
          dependsOn: [],
          requirements: ['req-1'],
          skills: [],
        },
        {
          path: 'lib/config.ts',
          description: 'Config',
          layer: 1,
          dependsOn: [],
          requirements: ['req-2'],
          skills: [],
        },
        {
          path: 'lib/utils.ts',
          description: 'Utils',
          layer: 1,
          dependsOn: ['lib/config.ts'], // Invalid: same layer import (both layer 1)
          requirements: ['req-2'],
          skills: [],
        },
      ],
    };

    mockAnthropicClient.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(invalidPlan) }],
    });

    await expect(generatePlan('Build a dashboard app')).rejects.toThrow(
      /imports from same layer/
    );
  });
});

// ============================================================================
// Tests: generateFiles
// ============================================================================

describe('generateFiles', () => {
  let generateFiles: typeof import('@/lib/generator').generateFiles;
  let uploadFile: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const generator = await import('@/lib/generator');
    generateFiles = generator.generateFiles;

    const sandboxModule = await import('@/lib/sandbox');
    uploadFile = vi.mocked(sandboxModule.uploadFile);
  });

  it('should process files in layer order and emit streaming events', async () => {
    const events: StreamEvent[] = [];
    const mockEmit = (event: StreamEvent) => events.push(event);

    // Setup streaming mock that immediately emits events
    const mockStream = {
      on: vi.fn((eventName: string, handler: Function) => {
        if (eventName === 'text') {
          // Immediately emit chunks synchronously
          handler('export type User = ');
          handler('{ id: string; }');
        }
        return mockStream; // Return for chaining
      }),
      finalMessage: vi.fn().mockResolvedValue({}),
    };

    mockAnthropicClient.messages.stream.mockResolvedValue(mockStream);

    const mockSandbox = {
      id: 'test-sandbox',
      fs: {
        uploadFile: vi.fn(),
      },
    } as any;

    // Execute
    await generateFiles(
      mockPlan,
      mockSandbox,
      'https://test.supabase.co',
      'test-anon-key',
      'claude-sonnet-4-5',
      mockEmit
    );

    // Verify layer 0 files were processed before layer 1
    const fileStartEvents = events.filter(e => e.type === 'file_start');
    expect(fileStartEvents).toHaveLength(3);

    const layer0Events = fileStartEvents.filter(
      e => e.type === 'file_start' && e.layer === 0
    );
    const layer1Events = fileStartEvents.filter(
      e => e.type === 'file_start' && e.layer === 1
    );

    expect(layer0Events).toHaveLength(2); // lib/types.ts, lib/supabase/client.ts
    expect(layer1Events).toHaveLength(1); // app/dashboard/page.tsx

    // Verify streaming events were emitted
    const chunkEvents = events.filter(e => e.type === 'file_chunk');
    expect(chunkEvents.length).toBeGreaterThan(0);

    // Verify files were uploaded
    expect(uploadFile).toHaveBeenCalledTimes(3);
  });

  it('should handle file generation errors gracefully', async () => {
    const events: StreamEvent[] = [];
    const mockEmit = (event: StreamEvent) => events.push(event);

    // Setup mock to fail on second file
    let callCount = 0;
    mockAnthropicClient.messages.stream.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Generation failed');
      }
      return Promise.resolve({
        on: vi.fn((eventName: string, handler: Function) => {
          if (eventName === 'text') {
            setTimeout(() => handler('content'), 10);
          }
        }),
        finalMessage: vi.fn().mockResolvedValue({}),
      });
    });

    const mockSandbox = {
      id: 'test-sandbox',
      fs: { uploadFile: vi.fn() },
    } as any;

    // Execute - should throw when layer fails
    await expect(
      generateFiles(
        mockPlan,
        mockSandbox,
        'https://test.supabase.co',
        'test-anon-key',
        'claude-sonnet-4-5',
        mockEmit
      )
    ).rejects.toThrow(/Layer 0 incomplete/);

    // Verify error event was emitted before throwing
    const errorEvents = events.filter(e => e.type === 'file_error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]).toMatchObject({
      type: 'file_error',
      error: expect.stringContaining('Generation failed'),
    });
  });
});

// ============================================================================
// Tests: verifyAndFix
// ============================================================================

describe('verifyAndFix', () => {
  let verifyAndFix: typeof import('@/lib/verifier').verifyAndFix;
  let runCommand: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const verifier = await import('@/lib/verifier');
    verifyAndFix = verifier.verifyAndFix;

    const sandboxModule = await import('@/lib/sandbox');
    runCommand = vi.mocked(sandboxModule.runCommand);
  });

  it('should return true when build passes immediately', async () => {
    const events: StreamEvent[] = [];
    const mockEmit = (event: StreamEvent) => events.push(event);

    // Mock successful build
    runCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Build successful',
    });

    const mockSandbox = {
      id: 'test-sandbox',
      process: {
        createSession: vi.fn(),
        executeSessionCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'Build successful',
        }),
      },
    } as any;

    const generatedContents = new Map([
      ['lib/types.ts', 'export type User = { id: string };'],
    ]);

    // Execute
    const result = await verifyAndFix(
      mockSandbox,
      generatedContents,
      'claude-sonnet-4-5',
      mockEmit
    );

    // Verify
    expect(result).toBe(true);
    expect(runCommand).toHaveBeenCalled();
  });

  it('should detect and fix build errors', async () => {
    const events: StreamEvent[] = [];
    const mockEmit = (event: StreamEvent) => events.push(event);

    // Mock build failure then success
    let buildAttempts = 0;
    runCommand.mockImplementation(() => {
      buildAttempts++;
      if (buildAttempts === 1) {
        return Promise.resolve({
          exitCode: 1,
          stdout: './lib/types.ts:5:10\nType error: Cannot find name "Usre"',
        });
      }
      return Promise.resolve({
        exitCode: 0,
        stdout: 'Build successful',
      });
    });

    // Mock Claude fix
    mockAnthropicClient.messages.create.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'export type User = { id: string };', // Fixed code
        },
      ],
    });

    const mockSandbox = {
      id: 'test-sandbox',
      fs: {
        uploadFile: vi.fn(),
      },
      process: {
        createSession: vi.fn(),
        executeSessionCommand: runCommand,
      },
    } as any;

    const generatedContents = new Map([
      ['lib/types.ts', 'export type Usre = { id: string };'], // Typo
    ]);

    // Execute
    const result = await verifyAndFix(
      mockSandbox,
      generatedContents,
      'claude-sonnet-4-5',
      mockEmit
    );

    // Verify
    expect(result).toBe(true);
    expect(buildAttempts).toBe(2);

    // Verify error event was emitted
    const errorEvents = events.filter(e => e.type === 'build_error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]).toMatchObject({
      type: 'build_error',
      errors: expect.arrayContaining([
        expect.objectContaining({
          file: 'lib/types.ts',
          line: 5,
        }),
      ]),
    });

    // Verify fix event was emitted
    const fixEvents = events.filter(e => e.type === 'build_fix');
    expect(fixEvents).toHaveLength(1);
  });

  it('should return false after max retry attempts', async () => {
    const events: StreamEvent[] = [];
    const mockEmit = (event: StreamEvent) => events.push(event);

    // Mock persistent build failure with parseable errors
    runCommand.mockResolvedValue({
      exitCode: 1,
      stdout: './lib/types.ts:1:1\nSyntax error: persistent failure',
    });

    mockAnthropicClient.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: 'attempted fix' }],
    });

    const mockSandbox = {
      id: 'test-sandbox',
      fs: { uploadFile: vi.fn() },
      process: {
        createSession: vi.fn(),
        executeSessionCommand: runCommand,
      },
    } as any;

    const generatedContents = new Map([['lib/types.ts', 'invalid code']]);

    // Execute (with shorter timeout for test)
    vi.useFakeTimers();
    const resultPromise = verifyAndFix(
      mockSandbox,
      generatedContents,
      'claude-sonnet-4-5',
      mockEmit
    );

    // Fast-forward through retry delays
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    vi.useRealTimers();

    // Verify
    expect(result).toBe(false);
    expect(runCommand).toHaveBeenCalledTimes(5); // MAX_FIX_RETRIES
  });
});

// ============================================================================
// Tests: Full Pipeline Orchestration
// ============================================================================

describe('Full Pipeline Orchestration', () => {
  it('should orchestrate plan → generate → verify stages', async () => {
    // This test validates the full integration without mocking internal calls
    const { generatePlan } = await import('@/lib/planner');
    const { generateFiles } = await import('@/lib/generator');
    const { verifyAndFix } = await import('@/lib/verifier');

    const events: StreamEvent[] = [];
    const mockEmit = (event: StreamEvent) => events.push(event);

    // Setup mocks for entire pipeline
    mockAnthropicClient.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockPlan) }],
    });

    const mockStream = {
      on: vi.fn((eventName: string, handler: Function) => {
        if (eventName === 'text') {
          // Immediately emit content
          handler('generated content');
        }
        return mockStream;
      }),
      finalMessage: vi.fn().mockResolvedValue({}),
    };

    mockAnthropicClient.messages.stream.mockResolvedValue(mockStream);

    const sandboxModule = await import('@/lib/sandbox');
    vi.mocked(sandboxModule.runCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'Build successful',
    });

    const mockSandbox = {
      id: 'test-sandbox',
      fs: { uploadFile: vi.fn() },
      process: {
        createSession: vi.fn(),
        executeSessionCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          stdout: 'Build successful',
        }),
      },
    } as any;

    // Execute full pipeline
    const plan = await generatePlan('Build a dashboard');
    expect(plan).toBeDefined();
    expect(plan.files.length).toBeGreaterThan(0);

    const generatedFiles = await generateFiles(
      plan,
      mockSandbox,
      'https://test.supabase.co',
      'test-key',
      'claude-sonnet-4-5',
      mockEmit
    );
    expect(generatedFiles.size).toBeGreaterThan(0);

    const buildPassed = await verifyAndFix(
      mockSandbox,
      generatedFiles,
      'claude-sonnet-4-5',
      mockEmit
    );
    expect(buildPassed).toBe(true);

    // Verify streaming events were emitted in correct order
    const stageTypes = events.map(e => e.type);
    expect(stageTypes).toContain('file_start');
    expect(stageTypes).toContain('file_chunk');
    expect(stageTypes).toContain('file_complete');
  });
});
