"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { PromptBar } from "@/components/prompt-bar";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

const PENDING_PROMPT_KEY = "vibestack_pending_prompt";

export function HeroPrompt() {
  const router = useRouter();

  async function handleSubmit(message: PromptInputMessage, _options?: { model: string; webSearch: boolean }) {
    const prompt = message.text.trim();
    if (!prompt) return;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      sessionStorage.setItem(PENDING_PROMPT_KEY, prompt);
      router.push("/auth/login");
      return;
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: prompt.slice(0, 80),
        prompt,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !project) {
      console.error("Failed to create project:", error);
      return;
    }

    router.push(`/project/${project.id}`);
  }

  return (
    <div className="mt-10 w-full max-w-2xl">
      <PromptBar onSubmit={handleSubmit} />
    </div>
  );
}
