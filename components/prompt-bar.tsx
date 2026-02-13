"use client";

import { useState } from "react";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { GlobeIcon, ChevronDownIcon } from "lucide-react";
import type { ChatStatus } from "ai";

const models = [
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "anthropic" as const },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic" as const },
  { id: "gpt-5.2", name: "GPT-5.2", provider: "openai" as const },
];

interface PromptBarProps {
  onSubmit: (message: PromptInputMessage, options: { model: string; webSearch: boolean }) => void | Promise<void>;
  placeholder?: string;
  status?: ChatStatus;
  disabled?: boolean;
}

export function PromptBar({
  onSubmit,
  placeholder = "Describe the app you want to build...",
  status,
  disabled,
}: PromptBarProps) {
  const [text, setText] = useState("");
  const [model, setModel] = useState(models[0].id);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const selectedModel = models.find((m) => m.id === model) ?? models[0];

  function handleSubmit(message: PromptInputMessage) {
    const result = onSubmit(message, { model, webSearch: useWebSearch });
    setText("");
    return result;
  }

  return (
    <PromptInput onSubmit={handleSubmit} multiple>
      <PromptInputBody>
        <PromptInputTextarea
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          <PromptInputButton
            onClick={() => setUseWebSearch(!useWebSearch)}
            tooltip={{ content: "Search the web", shortcut: "⌘K" }}
            variant={useWebSearch ? "default" : "ghost"}
          >
            <GlobeIcon size={16} />
            <span>Search</span>
          </PromptInputButton>
          <ModelSelector open={selectorOpen} onOpenChange={setSelectorOpen}>
            <ModelSelectorTrigger asChild>
              <PromptInputButton tooltip={{ content: "Select model" }}>
                <ModelSelectorLogo provider={selectedModel.provider} />
                <span>{selectedModel.name}</span>
                <ChevronDownIcon size={12} />
              </PromptInputButton>
            </ModelSelectorTrigger>
            <ModelSelectorContent>
              <ModelSelectorInput placeholder="Search models..." />
              <ModelSelectorList>
                <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                <ModelSelectorGroup heading="Anthropic">
                  {models.filter((m) => m.provider === "anthropic").map((m) => (
                    <ModelSelectorItem
                      key={m.id}
                      value={m.id}
                      onSelect={() => {
                        setModel(m.id);
                        setSelectorOpen(false);
                      }}
                    >
                      <ModelSelectorLogo provider={m.provider} />
                      <ModelSelectorName>{m.name}</ModelSelectorName>
                    </ModelSelectorItem>
                  ))}
                </ModelSelectorGroup>
                <ModelSelectorGroup heading="OpenAI">
                  {models.filter((m) => m.provider === "openai").map((m) => (
                    <ModelSelectorItem
                      key={m.id}
                      value={m.id}
                      onSelect={() => {
                        setModel(m.id);
                        setSelectorOpen(false);
                      }}
                    >
                      <ModelSelectorLogo provider={m.provider} />
                      <ModelSelectorName>{m.name}</ModelSelectorName>
                    </ModelSelectorItem>
                  ))}
                </ModelSelectorGroup>
              </ModelSelectorList>
            </ModelSelectorContent>
          </ModelSelector>
        </PromptInputTools>
        <PromptInputSubmit
          disabled={disabled || !text.trim()}
          status={status}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
