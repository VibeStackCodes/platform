import createClient from 'openapi-fetch';

// Minimal typed paths for the Supabase Management API endpoints we use
interface DatabaseQueryPath {
  post: {
    parameters: { path: { ref: string } };
    requestBody: { content: { 'application/json': { query: string; read_only?: boolean } } };
    responses: { 201: { content: { 'application/json': unknown[] } } };
  };
}

export interface ManagementApiPaths {
  '/v1/projects/{ref}/database/query': DatabaseQueryPath;
  [key: string]: any;
}

export const client = createClient<ManagementApiPaths>({
  baseUrl: '/api/supabase-proxy',
});
