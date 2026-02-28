import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { CopyIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from './message'

const meta: Meta = {
  title: 'AI/Message',
  component: Message,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

export const UserMessage: Story = {
  render: () => (
    <Message from="user">
      <MessageContent>
        Build me a full-stack Todo app with authentication, real-time sync, and a clean minimal UI
        using Tailwind CSS. Include user registration, login, and the ability to create, edit,
        delete, and reorder todos with drag-and-drop.
      </MessageContent>
    </Message>
  ),
}

export const AssistantMessage: Story = {
  render: () => (
    <Message from="assistant">
      <MessageContent>
        <MessageResponse>
          {`I'll build you a full-stack Todo app with all those features. Here's what I'll create:

## Features
- **Authentication**: Email/password registration and login via Supabase Auth
- **Real-time sync**: Live updates using Supabase Realtime subscriptions
- **Drag-and-drop**: Reorderable todos using \`@dnd-kit\`
- **Clean UI**: Tailwind CSS with shadcn/ui components

## Tech Stack
- React 19 + TanStack Router
- Supabase (Auth + Realtime + Database)
- Tailwind CSS v4
- @dnd-kit for drag-and-drop

Let me start building this now...`}
        </MessageResponse>
      </MessageContent>
      <MessageToolbar>
        <MessageActions>
          <MessageAction tooltip="Copy" onClick={fn()}>
            <CopyIcon size={14} />
          </MessageAction>
          <MessageAction tooltip="Thumbs up" onClick={fn()}>
            <ThumbsUpIcon size={14} />
          </MessageAction>
          <MessageAction tooltip="Thumbs down" onClick={fn()}>
            <ThumbsDownIcon size={14} />
          </MessageAction>
        </MessageActions>
      </MessageToolbar>
    </Message>
  ),
}

export const ShortUserMessage: Story = {
  render: () => (
    <Message from="user">
      <MessageContent>Add dark mode support.</MessageContent>
    </Message>
  ),
}

export const LongAssistantMessage: Story = {
  render: () => (
    <Message from="assistant">
      <MessageContent>
        <MessageResponse>
          {`Sure! I'll add comprehensive dark mode support to your app. This involves:

1. Setting up a \`ThemeProvider\` using React context
2. Persisting the user's preference in \`localStorage\`
3. Respecting the system \`prefers-color-scheme\` media query
4. Adding a toggle button in the navigation

\`\`\`typescript
// src/components/theme-provider.tsx
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

interface ThemeProviderContext {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderContext>({
  theme: 'system',
  setTheme: () => null,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'system'
  })

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }

    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
\`\`\`

The theme toggle button is now wired up and dark mode is fully functional.`}
        </MessageResponse>
      </MessageContent>
    </Message>
  ),
}
