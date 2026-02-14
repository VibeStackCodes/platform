# Sandbox Preview Architecture Overhaul

**Date**: 2026-02-14
**Status**: Approved — Phase 1 (Direct URL) now, Phase 2 (Cloudflare) later

## Problem

The current sandbox preview architecture uses a Next.js API route (`/api/projects/[id]/preview/[[...path]]/route.ts`) as a reverse proxy to forward HTTP requests to the Daytona sandbox dev server. This approach has two fatal flaws:

1. **No WebSocket support**: Next.js App Router `route.ts` handlers use `fetch()` which cannot handle WebSocket upgrade requests. Vite HMR requires WebSocket (`wss://`), so hot module replacement is completely broken through the proxy.

2. **Fragile path rewriting**: The proxy injects `<base href="/api/projects/{id}/preview/">` into HTML responses to make Vite's absolute paths (like `/@vite/client`, `/@react-refresh`) resolve through the proxy. This is a brittle hack that breaks for dynamic imports, WebSocket URLs, and Vite's internal module graph.

### Errors observed

```
# WebSocket (Vite HMR cannot connect through HTTP-only proxy)
WebSocket connection to 'wss://...' failed: WebSocket is closed before the connection is established.

# 404s (Vite internal modules not resolving through <base href> hack)
Failed to load resource: 404 (@vite-plugin-checker-runtime)
Failed to load resource: 404 (client)
Failed to load resource: 404 (@react-refresh)
Failed to load resource: 404 (main.tsx)
```

## Current Architecture

```
Browser iframe
  └── src="/api/projects/{id}/preview"
        └── Next.js API route (fetch-based proxy)
              └── Daytona sandbox (Vite dev server on :3000)
                    ├── HTTP responses ✓ (proxied)
                    └── WebSocket (HMR) ✗ (fetch cannot upgrade)
```

Key files:
- `app/api/projects/[id]/preview/[[...path]]/route.ts` — HTTP-only reverse proxy
- `app/api/projects/[id]/sandbox-urls/route.ts` — returns proxy URL to client
- `components/builder-preview.tsx` — renders iframe via `WebPreviewBody`
- `components/ai-elements/web-preview.tsx` — iframe with `sandbox` attribute
- `components/project-layout.tsx` — polls `sandbox-urls`, subscribes to Supabase realtime
- `lib/sandbox.ts` — `getPreviewUrl()`, `getSignedPreviewUrl()`, `waitForDevServer()`

## Phase 1: Direct Daytona Signed URL (Immediate Fix)

### Approach

Use `getSignedPreviewUrl(3000, 3600)` directly as the iframe `src`. Daytona's own proxy infrastructure supports WebSocket natively, so Vite HMR works without any custom proxy.

### Changes

1. **`sandbox-urls/route.ts`**: Return the signed Daytona URL directly instead of a same-origin proxy URL
2. **`project-layout.tsx`**: Use the signed URL as iframe src; add timer to refresh before expiry
3. **`builder-preview.tsx`**: Pass the direct URL; remove dependency on proxy path
4. **`web-preview.tsx`**: Remove `sandbox` attribute restriction on `allow-same-origin` (cross-origin iframe doesn't need it)
5. **Delete `preview/[[...path]]/route.ts`**: The proxy is no longer needed

### Token refresh mechanism

Signed URLs expire after 1 hour. The client must refresh before expiry:

```
1. sandbox-urls returns { previewUrl, expiresAt }
2. Client sets a timer for (expiresAt - 5min)
3. On timer: fetch new signed URL from sandbox-urls
4. Update iframe src (Vite reconnects HMR automatically)
```

### Trade-offs

| Pro | Con |
|-----|-----|
| Zero proxy infrastructure | Daytona-branded URLs visible in iframe |
| Vite HMR works natively | URLs expire (1h), need refresh |
| Simplest possible implementation | No custom branding on preview domain |
| Eliminates all current errors | Daytona warning page possible on first load |

## Phase 2: Cloudflare-Based Proxy (Future Upgrade)

### Architecture

```
Browser iframe
  └── src="{projectId}.preview.vibestack.app"
        └── Cloudflare Edge (300+ locations)
              ├── Worker: extracts projectId from subdomain
              │          looks up sandbox token from KV
              │          proxies HTTP with X-Daytona-Preview-Token
              └── WebSocket: native upgrade forwarding to Daytona
                    └── Daytona sandbox (Vite dev server on :3000)
```

### Components

#### 1. DNS Setup
- `*.preview.vibestack.app` CNAME → Cloudflare (proxied)
- Cloudflare Advanced Certificate Manager ($10/mo) for wildcard TLS

#### 2. Cloudflare Worker (`preview-proxy`)

```typescript
// Pseudocode — actual Worker implementation
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const projectId = url.hostname.split('.')[0]; // extract from subdomain

    // Look up sandbox mapping from KV (cached)
    const mapping = await env.SANDBOX_KV.get(projectId, 'json');
    if (!mapping) return new Response('Sandbox not found', { status: 404 });

    // Build target URL on Daytona
    const target = new URL(url.pathname + url.search, mapping.daytonaUrl);

    // Proxy with auth headers
    const headers = new Headers(request.headers);
    headers.set('X-Daytona-Preview-Token', mapping.token);
    headers.set('X-Daytona-Skip-Preview-Warning', 'true');
    headers.set('X-Daytona-Disable-CORS', 'true');

    // WebSocket upgrades are handled natively by Cloudflare
    return fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.body,
    });
  }
};
```

#### 3. KV Token Store

Platform API writes sandbox mappings to Cloudflare KV when sandboxes are provisioned:

```
Key: {projectId}
Value: { sandboxId, daytonaUrl, token, createdAt }
TTL: 24 hours (auto-cleanup for abandoned sandboxes)
```

Token refresh: platform API updates KV when `getPreviewLink()` returns a new token.

#### 4. Platform Integration

- `provisionProject()` writes to KV after sandbox creation
- `sandbox-urls/route.ts` returns `https://{projectId}.preview.vibestack.app`
- No expiry visible to client — Worker refreshes Daytona tokens server-side
- `destroySandbox()` deletes KV entry

### Cost

| Component | Cost |
|-----------|------|
| Cloudflare Workers (free tier) | $0 (100k req/day) |
| Cloudflare Workers (paid) | $5/mo (10M req/mo) |
| KV reads | $0.50/M reads |
| KV writes | $5.00/M writes |
| Advanced Certificate Manager | $10/mo |
| **Total (typical)** | **~$15/mo** |

### Migration path from Phase 1 to Phase 2

1. Deploy Cloudflare Worker + KV
2. Set up wildcard DNS + TLS
3. Update `provisionProject()` to write KV entries
4. Update `sandbox-urls/route.ts` to return `*.preview.vibestack.app` URLs
5. Remove signed URL refresh logic from client
6. Done — iframe src changes, nothing else

## Industry Comparison

| Platform | Preview Domain | HMR Mechanism | Auth |
|----------|---------------|---------------|------|
| StackBlitz/bolt.new | `*.webcontainer.io` | In-browser WASM (no network) | None (local) |
| CodeSandbox | `{id}-{port}.csb.app` | WebSocket patching + ServiceWorker | Platform-level |
| Replit | `*.replit.dev` | Eval reverse WS proxy | Connection tokens |
| **VibeStack Phase 1** | `*.proxy.daytona.works` | Direct Daytona WS | Signed URL token |
| **VibeStack Phase 2** | `*.preview.vibestack.app` | Cloudflare WS passthrough | KV-stored token |

## Decision

- **Now**: Phase 1 (Direct Daytona Signed URL) — eliminates all current errors with minimal changes
- **Later**: Phase 2 (Cloudflare Proxy) — branded URLs, no client-side expiry, enterprise-grade
