/**
 * E2E Generation Pipeline Tests
 *
 * Tests the complete generation pipeline including:
 * - Plan generation with validation
 * - Layer-by-layer file generation with streaming
 * - Build verification with error fixing
 * - Full pipeline orchestration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Plan, StreamEvent } from '@/lib/types';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock OpenAI SDK (what the code actually uses)
const mockOpenAIClient = {
  responses: {
    create: vi.fn(),
    stream: vi.fn(),
    parse: vi.fn(),
  },
};

vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = mockOpenAIClient.responses;
    constructor() {
      return { responses: mockOpenAIClient.responses } as any;
    }
  },
}));

vi.mock('openai/helpers/zod', () => ({
  zodTextFormat: vi.fn(() => ({ type: 'json_schema', json_schema: {} })),
}));

// Mock AI SDK (used as fallback for non-OpenAI models)
const mockStreamText = vi.fn();
const mockGenerateText = vi.fn();

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
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
    // The planner uses OpenAI Responses API with structured outputs
    mockOpenAIClient.responses.parse.mockResolvedValue({
      output_parsed: mockPlan,
    });

    const result = await generatePlan('Build a dashboard app');

    expect(result).toBeDefined();
    expect(result.appName).toBe('Test App');
    expect(result.files).toHaveLength(3);
    expect(result.requirements).toHaveLength(2);
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

    mockOpenAIClient.responses.parse.mockResolvedValue({
      output_parsed: invalidPlan,
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

    mockOpenAIClient.responses.parse.mockResolvedValue({
      output_parsed: invalidPlan,
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

    mockOpenAIClient.responses.parse.mockResolvedValue({
      output_parsed: invalidPlan,
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

    // The generator calls responses.stream once per layer.
    // Layer 0 has 2 files, layer 1 has 1 file. Return layer-specific streams.
    const filesByLayer: Record<number, typeof mockPlan.files> = {};
    for (const file of mockPlan.files) {
      (filesByLayer[file.layer] ??= []).push(file);
    }

    let streamCallCount = 0;
    mockOpenAIClient.responses.stream.mockImplementation(() => {
      const layerFiles = Object.values(filesByLayer)[streamCallCount++] ?? [];
      const events = layerFiles.map(file => ({
        type: 'response.function_call_arguments.done',
        arguments: JSON.stringify({ path: file.path, content: `// ${file.path} content` }),
      }));
      return {
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) yield event;
        },
        finalResponse: vi.fn().mockResolvedValue({
          output: layerFiles.map(file => ({
            type: 'function_call',
            name: 'write_file',
            arguments: JSON.stringify({ path: file.path, content: `// ${file.path} content` }),
          })),
        }),
      };
    });

    const mockSandbox = {
      id: 'test-sandbox',
      fs: { uploadFile: vi.fn() },
      git: {
        add: vi.fn(),
        commit: vi.fn().mockResolvedValue({ sha: 'abc1234' }),
      },
    } as any;

    await generateFiles(
      mockPlan,
      mockSandbox,
      'https://test.supabase.co',
      'test-anon-key',
      'gpt-5.2',
      mockEmit
    );

    // Verify layer 0 files were processed before layer 1
    const fileStartEvents = events.filter(e => e.type === 'file_start');
    expect(fileStartEvents).toHaveLength(3);

    // Verify streaming events were emitted
    const chunkEvents = events.filter(e => e.type === 'file_chunk');
    expect(chunkEvents.length).toBeGreaterThan(0);

    // Verify files were uploaded
    expect(uploadFile).toHaveBeenCalledTimes(3);
  });

  it('should handle file generation errors gracefully', async () => {
    const events: StreamEvent[] = [];
    const mockEmit = (event: StreamEvent) => events.push(event);

    // Mock stream that throws
    mockOpenAIClient.responses.stream.mockImplementation(() => {
      throw new Error('Generation failed');
    });

    const mockSandbox = {
      id: 'test-sandbox',
      fs: { uploadFile: vi.fn() },
      git: {
        add: vi.fn(),
        commit: vi.fn().mockResolvedValue({ sha: 'abc1234' }),
      },
    } as any;

    await expect(
      generateFiles(
        mockPlan,
        mockSandbox,
        'https://test.supabase.co',
        'test-anon-key',
        'gpt-5.2',
        mockEmit
      )
    ).rejects.toThrow(/Generation failed/);

    // Verify error events were emitted
    const errorEvents = events.filter(e => e.type === 'file_error');
    expect(errorEvents).toHaveLength(2); // layer 0 has 2 files
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
      fs: { uploadFile: vi.fn() },
    } as any;

    const generatedContents = new Map([
      ['lib/types.ts', 'export type User = { id: string };'],
    ]);

    const result = await verifyAndFix(
      mockSandbox,
      generatedContents,
      'gpt-5.2',
      mockEmit
    );

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
          stdout: 'lib/types.ts(5,10): error TS2304: Cannot find name "Usre"',
        });
      }
      return Promise.resolve({
        exitCode: 0,
        stdout: 'Build successful',
      });
    });

    // Mock OpenAI error analysis (structured output)
    mockOpenAIClient.responses.parse.mockResolvedValue({
      output_parsed: {
        errors: [{
          file: 'lib/types.ts',
          line: 5,
          message: 'Cannot find name "Usre"',
          errorType: 'type_error',
          suggestedFix: 'Rename Usre to User',
        }],
        rootCause: 'Typo in type name',
        fixOrder: ['lib/types.ts'],
      },
    });

    // Mock OpenAI fix response
    mockOpenAIClient.responses.create.mockResolvedValue({
      output_text: 'export type User = { id: string };',
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: 'export type User = { id: string };' }],
      }],
    });

    const mockSandbox = {
      id: 'test-sandbox',
      fs: {
        uploadFile: vi.fn(),
      },
    } as any;

    const generatedContents = new Map([
      ['lib/types.ts', 'export type Usre = { id: string };'],
    ]);

    const result = await verifyAndFix(
      mockSandbox,
      generatedContents,
      'gpt-5.2',
      mockEmit
    );

    expect(result).toBe(true);
    expect(buildAttempts).toBe(2);

    // Verify error event was emitted
    const errorEvents = events.filter(e => e.type === 'build_error');
    expect(errorEvents).toHaveLength(1);

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
      stdout: 'lib/types.ts(1,1): error TS1005: Syntax error: persistent failure',
    });

    // Mock error analysis
    mockOpenAIClient.responses.parse.mockResolvedValue({
      output_parsed: {
        errors: [{
          file: 'lib/types.ts',
          line: 1,
          message: 'Syntax error',
          errorType: 'syntax_error',
          suggestedFix: 'Fix syntax',
        }],
        rootCause: 'Invalid syntax',
        fixOrder: ['lib/types.ts'],
      },
    });

    // Mock fix response (always returns broken code)
    mockOpenAIClient.responses.create.mockResolvedValue({
      output_text: 'still broken code',
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: 'still broken code' }],
      }],
    });

    const mockSandbox = {
      id: 'test-sandbox',
      fs: { uploadFile: vi.fn() },
    } as any;

    const generatedContents = new Map([['lib/types.ts', 'invalid code']]);

    const result = await verifyAndFix(
      mockSandbox,
      generatedContents,
      'gpt-5.2',
      mockEmit
    );

    // MAX_FIX_RETRIES is 2 in verifier.ts
    expect(result).toBe(false);
    expect(runCommand).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// Tests: Full Pipeline Orchestration
// ============================================================================

describe('Full Pipeline Orchestration', () => {
  it('should orchestrate plan → generate → verify stages', async () => {
    vi.clearAllMocks();

    const { generatePlan } = await import('@/lib/planner');
    const { generateFiles } = await import('@/lib/generator');
    const { verifyAndFix } = await import('@/lib/verifier');

    const events: StreamEvent[] = [];
    const mockEmit = (event: StreamEvent) => events.push(event);

    // Mock planner (OpenAI responses.parse)
    mockOpenAIClient.responses.parse.mockResolvedValue({
      output_parsed: mockPlan,
    });

    // Mock generator (OpenAI responses.stream with function calls)
    const functionCallEvents = mockPlan.files.map(file => ({
      type: 'response.function_call_arguments.done',
      arguments: JSON.stringify({ path: file.path, content: `// ${file.path}` }),
    }));

    mockOpenAIClient.responses.stream.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        for (const event of functionCallEvents) {
          yield event;
        }
      },
      finalResponse: vi.fn().mockResolvedValue({
        output: mockPlan.files.map(file => ({
          type: 'function_call',
          name: 'write_file',
          arguments: JSON.stringify({ path: file.path, content: `// ${file.path}` }),
        })),
      }),
    });

    // Mock verifier (build passes immediately)
    const sandboxModule = await import('@/lib/sandbox');
    vi.mocked(sandboxModule.runCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'Build successful',
    });

    const mockSandbox = {
      id: 'test-sandbox',
      fs: { uploadFile: vi.fn() },
      git: {
        add: vi.fn(),
        commit: vi.fn().mockResolvedValue({ sha: 'abc1234' }),
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
      'gpt-5.2',
      mockEmit
    );
    expect(generatedFiles.size).toBeGreaterThan(0);

    const buildPassed = await verifyAndFix(
      mockSandbox,
      generatedFiles,
      'gpt-5.2',
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
