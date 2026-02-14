/**
 * GET /api/projects/[id]/sandbox-urls
 *
 * Returns sandbox preview + code server URLs.
 * Preview URL is a signed Daytona URL loaded directly in the iframe —
 * supports both HTTP and WebSocket (Vite HMR).
 *
 * TODO: Phase 2 — replace with Cloudflare proxy on *.preview.vibestack.app
 * See docs/plans/2026-02-14-sandbox-preview-architecture-design.md
 */

import { NextRequest, NextResponse } from "next/server";
import { findSandboxByProject, getPreviewUrl, waitForDevServer, waitForCodeServer } from "@/lib/sandbox";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const sandbox = await findSandboxByProject(projectId);
  if (!sandbox) {
    return NextResponse.json({ previewUrl: null, codeServerUrl: null, expiresAt: null });
  }

  try {
    const expiresInSeconds = 3600; // 1 hour

    // Wait for both servers to be ready before returning signed URLs
    const [, , preview, codeServer] = await Promise.all([
      waitForDevServer(sandbox),
      waitForCodeServer(sandbox),
      getPreviewUrl(sandbox, 3000),
      getPreviewUrl(sandbox, 13337),
    ]);

    return NextResponse.json({
      sandboxId: sandbox.id,
      previewUrl: preview.url,
      codeServerUrl: codeServer.url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    });
  } catch {
    return NextResponse.json({ sandboxId: sandbox.id, previewUrl: null, codeServerUrl: null, expiresAt: null });
  }
}
