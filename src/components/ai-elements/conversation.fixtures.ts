import type { ConversationMessage } from './conversation'

export const sampleMessages: ConversationMessage[] = [
  {
    role: 'user',
    content: 'Build me a Todo app with authentication and real-time sync.',
  },
  {
    role: 'assistant',
    content:
      "I'll build you a full-featured Todo application with Supabase Auth and real-time updates. Let me start by setting up the project structure and configuring the database schema.",
  },
  {
    role: 'user',
    content: 'Add dark mode support too.',
  },
  {
    role: 'assistant',
    content:
      "Great idea! I'll add a ThemeProvider with system preference detection and a toggle button in the navigation bar. The theme will be persisted in localStorage.",
  },
  {
    role: 'user',
    content: 'Can you also add drag and drop for reordering todos?',
  },
  {
    role: 'assistant',
    content:
      "Absolutely! I'll integrate @dnd-kit for accessible drag-and-drop reordering. The order will be persisted to the database so it syncs across devices in real-time.",
  },
]

export const emptyMessages: ConversationMessage[] = []

export const singleExchangeMessages: ConversationMessage[] = [
  {
    role: 'user',
    content: 'Hello! What can you build for me?',
  },
  {
    role: 'assistant',
    content:
      "I can build any web application you have in mind — dashboards, e-commerce sites, social apps, productivity tools, and more. Just describe what you need and I'll generate the full codebase with a live preview!",
  },
]
