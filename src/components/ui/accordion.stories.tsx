import type { Meta, StoryObj } from '@storybook/react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './accordion'

const meta = {
  title: 'UI/Accordion',
  component: Accordion,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  // Accordion has a discriminated union prop (type: 'single' | 'multiple').
  // A default args entry satisfies the required constraint; each story uses
  // its own render function so this value is never forwarded to the DOM.
  args: { type: 'single' as const },
} satisfies Meta<typeof Accordion>

export default meta
type Story = StoryObj<typeof meta>

// ── type: single ──────────────────────────────────────────────────────────────

export const Single: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-[420px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>What is VibeStack?</AccordionTrigger>
        <AccordionContent>
          VibeStack is an AI-powered app builder that generates full Vite + React
          projects from a plain-language description. Describe your idea, and the
          platform writes the code, wires the components, and deploys a live preview.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>How are credits calculated?</AccordionTrigger>
        <AccordionContent>
          Credits are token-based — 1 credit equals 1,000 tokens. Credits are
          reserved pessimistically before generation starts, then settled to actual
          usage once the agent finishes.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Which AI models are available?</AccordionTrigger>
        <AccordionContent>
          You can select from GPT-5.2 Codex (OpenAI), Claude Opus 4.6, or Claude
          Sonnet 4.6 per generation. Provider routing is handled server-side with
          no proxy.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const SingleDefaultOpen: Story = {
  name: 'Single — Default Open',
  render: () => (
    <Accordion type="single" collapsible defaultValue="item-1" className="w-[420px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>Getting started</AccordionTrigger>
        <AccordionContent>
          Sign up, describe your app idea in the prompt bar, pick a model, and hit
          generate. The sandbox spins up and the agent starts writing code.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Editing generated code</AccordionTrigger>
        <AccordionContent>
          Use the chat panel to describe changes. The agent will apply edits using
          Relace Instant Apply, rebuild, and refresh the preview automatically.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Deploying your app</AccordionTrigger>
        <AccordionContent>
          Click the Deploy button in the preview panel. The platform pushes to
          GitHub and triggers a Vercel deployment. A live URL is available within
          seconds.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

// ── type: multiple ────────────────────────────────────────────────────────────

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" className="w-[420px]">
      <AccordionItem value="item-1">
        <AccordionTrigger>Sandbox lifecycle</AccordionTrigger>
        <AccordionContent>
          Sandboxes are created from a pre-built Daytona snapshot containing the
          full Vite scaffold. They persist between sessions so incremental edits
          resume instantly.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>File operations</AccordionTrigger>
        <AccordionContent>
          The agent has access to writeFile, writeFiles, readFile, editFile, and
          listFiles tools. Edits are applied via the Relace Instant Apply API,
          which merges diffs intelligently.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Build loop</AccordionTrigger>
        <AccordionContent>
          After writing code the agent calls runBuild. If the build fails it reads
          the error output, applies a fix, and rebuilds. Up to 3 repair attempts
          are made before the agent reports a failure.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}
