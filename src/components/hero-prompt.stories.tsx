/**
 * HeroPrompt — auth + router context story
 *
 * HeroPrompt calls:
 *   - useNavigate()   from @tanstack/react-router
 *   - useAuth()       from @/lib/auth  (reads Supabase session)
 *
 * Neither context is available in a plain Storybook iframe. To keep stories
 * runnable without mocking entire SDKs we render the underlying
 * LandingPromptBar directly in most stories. The HeroPrompt story below shows
 * what the component looks like and documents the missing context.
 *
 * If you need a fully interactive HeroPrompt story, add a storybook-addon-router
 * decorator and a mock auth context (see storybook-decorators.tsx).
 */
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { LandingPromptBar } from './landing-prompt-bar'

// We story LandingPromptBar (the visual output of HeroPrompt) since HeroPrompt
// wraps it with no additional UI — all visual variation lives in LandingPromptBar.
const meta = {
  title: 'Builder/HeroPrompt',
  component: LandingPromptBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
**HeroPrompt** is a thin controller component that wires \`LandingPromptBar\` to
TanStack Router navigation and Supabase auth.  Because it depends on
\`useNavigate()\` and \`useAuth()\` it cannot render in isolation without router
and auth mocks.

These stories render **LandingPromptBar** directly — the exact UI that HeroPrompt
produces — to allow visual and interaction testing without those context deps.
        `.trim(),
      },
    },
  },
  args: {
    onSubmit: fn(),
  },
} satisfies Meta<typeof LandingPromptBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: 'Describe the app you want to build...',
  },
}

export const CustomPlaceholder: Story = {
  args: {
    placeholder: 'What would you like to build today?',
  },
}

export const WrappedInHeroSection: Story = {
  decorators: [
    (Story) => (
      <div className="flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-8 px-4">
        <h1 className="text-center text-4xl font-bold tracking-tight">
          Build your next app with AI
        </h1>
        <p className="text-center text-muted-foreground">
          Describe what you want and we'll generate it in seconds.
        </p>
        <div className="w-full">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    placeholder: 'Describe the app you want to build...',
  },
}
