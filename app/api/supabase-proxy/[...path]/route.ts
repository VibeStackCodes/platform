/**
 * Supabase Management API Proxy
 *
 * Forwards requests to api.supabase.com/v1 with server-side auth token.
 * Authenticates the user and verifies project ownership before proxying.
 */

import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_API_BASE = 'https://api.supabase.com';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, await params, 'POST');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, await params, 'GET');
}

async function proxyRequest(
  req: NextRequest,
  { path }: { path: string[] },
  method: string,
) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Authenticate user
  const { createClient } = await import('@/lib/supabase-server');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Extract project ref from path (e.g., v1/projects/{ref}/database/query)
  const fullPath = path.join('/');
  const projectRefMatch = fullPath.match(/projects\/([^/]+)/);
  if (projectRefMatch) {
    const projectRef = projectRefMatch[1];
    // Verify user owns this project
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('supabase_project_id', projectRef)
      .eq('user_id', user.id)
      .single();
    if (!project) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Forward to Supabase Management API
  const targetUrl = `${SUPABASE_API_BASE}/${fullPath}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = { method, headers };
  if (method === 'POST') {
    fetchOptions.body = await req.text();
  }

  const response = await fetch(targetUrl, fetchOptions);
  const data = await response.text();

  return new NextResponse(data, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
