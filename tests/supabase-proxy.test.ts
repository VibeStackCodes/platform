/**
 * Tests for Supabase Management API Proxy
 *
 * Validates authentication, authorization, and request forwarding logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock dependencies
vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(),
}));

describe('Supabase Proxy Route', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockSupabaseClient: any;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Setup default mocks
    mockSupabaseClient = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(),
            })),
          })),
        })),
      })),
    };

    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Environment validation', () => {
    it('returns 500 when SUPABASE_ACCESS_TOKEN is missing', async () => {
      // Arrange
      delete process.env.SUPABASE_ACCESS_TOKEN;

      const { createClient } = await import('@/lib/supabase-server');
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/supabase-proxy/v1/projects');
      const params = { path: ['v1', 'projects'] };

      // Act
      const { proxyRequest } = await importRouteHandler();
      const response = await proxyRequest(req, params, 'GET');
      const json = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(json).toEqual({ error: 'Server misconfigured' });
    });
  });

  describe('Authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      // Arrange
      process.env.SUPABASE_ACCESS_TOKEN = 'test-token';

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { createClient } = await import('@/lib/supabase-server');
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/supabase-proxy/v1/projects');
      const params = { path: ['v1', 'projects'] };

      // Act
      const { proxyRequest } = await importRouteHandler();
      const response = await proxyRequest(req, params, 'GET');
      const json = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(json).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('Authorization', () => {
    it('returns 403 when user does not own the project', async () => {
      // Arrange
      process.env.SUPABASE_ACCESS_TOKEN = 'test-token';

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const mockQuery = {
        data: null,
        error: null,
      };

      const chainedMock = {
        single: vi.fn().mockResolvedValue(mockQuery),
      };
      const eqMock2 = vi.fn().mockReturnValue(chainedMock);
      const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock1 });

      mockSupabaseClient.from.mockReturnValue({ select: selectMock });

      const { createClient } = await import('@/lib/supabase-server');
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/supabase-proxy/v1/projects/abc123/database/query');
      const params = { path: ['v1', 'projects', 'abc123', 'database', 'query'] };

      // Act
      const { proxyRequest } = await importRouteHandler();
      const response = await proxyRequest(req, params, 'GET');
      const json = await response.json();

      // Assert
      expect(response.status).toBe(403);
      expect(json).toEqual({ error: 'Forbidden' });
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('projects');
      expect(selectMock).toHaveBeenCalledWith('id');
      expect(eqMock1).toHaveBeenCalledWith('supabase_project_id', 'abc123');
      expect(eqMock2).toHaveBeenCalledWith('user_id', 'user-123');
    });

    it('allows access when user owns the project', async () => {
      // Arrange
      process.env.SUPABASE_ACCESS_TOKEN = 'test-token';

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const mockQuery = {
        data: { id: 'project-id' },
        error: null,
      };

      const chainedMock = {
        single: vi.fn().mockResolvedValue(mockQuery),
      };
      const eqMock2 = vi.fn().mockReturnValue(chainedMock);
      const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock1 });

      mockSupabaseClient.from.mockReturnValue({ select: selectMock });

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ result: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const { createClient } = await import('@/lib/supabase-server');
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/supabase-proxy/v1/projects/abc123/database/query');
      const params = { path: ['v1', 'projects', 'abc123', 'database', 'query'] };

      // Act
      const { proxyRequest } = await importRouteHandler();
      const response = await proxyRequest(req, params, 'GET');
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toEqual({ result: 'success' });
    });
  });

  describe('Request forwarding', () => {
    beforeEach(() => {
      process.env.SUPABASE_ACCESS_TOKEN = 'test-token';

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });
    });

    it('successfully proxies GET request with correct URL and headers', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const { createClient } = await import('@/lib/supabase-server');
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/supabase-proxy/v1/organizations');
      const params = { path: ['v1', 'organizations'] };

      // Act
      const { proxyRequest } = await importRouteHandler();
      const response = await proxyRequest(req, params, 'GET');
      const json = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(json).toEqual({ data: 'test' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/organizations',
        {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('successfully proxies POST request with body forwarding', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ created: true }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const { createClient } = await import('@/lib/supabase-server');
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient);

      const requestBody = { name: 'New Project' };
      const req = new NextRequest('http://localhost:3000/api/supabase-proxy/v1/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      const params = { path: ['v1', 'projects'] };

      // Act
      const { proxyRequest } = await importRouteHandler();
      const response = await proxyRequest(req, params, 'POST');
      const json = await response.json();

      // Assert
      expect(response.status).toBe(201);
      expect(json).toEqual({ created: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );
    });

    it('handles paths without project ref (skips ownership check)', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ organizations: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const { createClient } = await import('@/lib/supabase-server');
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/supabase-proxy/v1/organizations');
      const params = { path: ['v1', 'organizations'] };

      // Act
      const { proxyRequest } = await importRouteHandler();
      const response = await proxyRequest(req, params, 'GET');

      // Assert
      expect(response.status).toBe(200);
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/organizations',
        expect.any(Object)
      );
    });

    it('correctly constructs target URL from path segments', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ result: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const { createClient } = await import('@/lib/supabase-server');
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/supabase-proxy/v1/health');
      const params = { path: ['v1', 'health'] };

      // Act
      const { proxyRequest } = await importRouteHandler();
      await proxyRequest(req, params, 'GET');

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/health',
        expect.any(Object)
      );
    });

    it('forwards response with correct status and content type', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        new Response('Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        })
      );

      const { createClient } = await import('@/lib/supabase-server');
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/supabase-proxy/v1/unknown');
      const params = { path: ['v1', 'unknown'] };

      // Act
      const { proxyRequest } = await importRouteHandler();
      const response = await proxyRequest(req, params, 'GET');
      const text = await response.text();

      // Assert
      expect(response.status).toBe(404);
      expect(text).toBe('Not Found');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('Path parsing', () => {
    beforeEach(() => {
      process.env.SUPABASE_ACCESS_TOKEN = 'test-token';

      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('extracts project ref from complex path', async () => {
      // Arrange
      const mockQuery = {
        data: { id: 'project-id' },
        error: null,
      };

      const chainedMock = {
        single: vi.fn().mockResolvedValue(mockQuery),
      };
      const eqMock2 = vi.fn().mockReturnValue(chainedMock);
      const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock1 });

      mockSupabaseClient.from.mockReturnValue({ select: selectMock });

      const { createClient } = await import('@/lib/supabase-server');
      vi.mocked(createClient).mockResolvedValue(mockSupabaseClient);

      const req = new NextRequest('http://localhost:3000/api/supabase-proxy/v1/projects/xyz789/database/tables/users/columns');
      const params = { path: ['v1', 'projects', 'xyz789', 'database', 'tables', 'users', 'columns'] };

      // Act
      const { proxyRequest } = await importRouteHandler();
      await proxyRequest(req, params, 'GET');

      // Assert
      expect(eqMock1).toHaveBeenCalledWith('supabase_project_id', 'xyz789');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects/xyz789/database/tables/users/columns',
        expect.any(Object)
      );
    });
  });
});

/**
 * Helper to import route handler with fresh module state
 */
async function importRouteHandler() {
  // Dynamic import to ensure mocks are applied
  const module = await import('@/app/api/supabase-proxy/[...path]/route');

  // Extract the proxyRequest function by calling the exported handlers
  // Since proxyRequest is internal, we need to test through GET/POST
  // But for easier testing, we'll create a wrapper
  const proxyRequest = async (req: NextRequest, params: { path: string[] }, method: string) => {
    const paramsPromise = Promise.resolve(params);
    if (method === 'GET') {
      return module.GET(req, { params: paramsPromise });
    } else if (method === 'POST') {
      return module.POST(req, { params: paramsPromise });
    }
    throw new Error(`Unsupported method: ${method}`);
  };

  return { proxyRequest, GET: module.GET, POST: module.POST };
}
