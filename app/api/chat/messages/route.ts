/**
 * Chat Messages Persistence API
 * POST — Upserts messages for a project (idempotent, called after each AI turn)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase-server";

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

export async function POST(req: NextRequest) {
  if (MOCK_MODE) {
    return NextResponse.json({ ok: true });
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, messages } = (await req.json()) as {
    projectId: string;
    messages: Array<{ id: string; role: string; parts: unknown[] }>;
  };

  if (!projectId || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify project ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Upsert all messages (ON CONFLICT update parts in case of re-sends)
  const rows = messages.map((m) => ({
    id: m.id,
    project_id: projectId,
    role: m.role,
    parts: JSON.stringify(m.parts),
  }));

  const { error } = await supabase
    .from("chat_messages")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    console.error("[chat/messages] upsert error:", error);
    return NextResponse.json({ error: "Failed to save messages" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
