import type { Meta, StoryObj } from '@storybook/react'
import { PageProgressCard } from './page-progress-card'

const meta = {
  title: 'AI/PageProgressCard',
  component: PageProgressCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PageProgressCard>

export default meta
type Story = StoryObj<typeof meta>

export const AllComplete: Story = {
  args: {
    pages: [
      {
        fileName: 'App.tsx',
        route: '/',
        componentName: 'App',
        status: 'complete',
        lineCount: 142,
        code: `export function App() {\n  return <div>Hello World</div>\n}`,
      },
      {
        fileName: 'Dashboard.tsx',
        route: '/dashboard',
        componentName: 'Dashboard',
        status: 'complete',
        lineCount: 320,
      },
      {
        fileName: 'Settings.tsx',
        route: '/settings',
        componentName: 'Settings',
        status: 'complete',
        lineCount: 215,
      },
    ],
  },
}

export const InProgress: Story = {
  args: {
    pages: [
      {
        fileName: 'App.tsx',
        route: '/',
        componentName: 'App',
        status: 'complete',
        lineCount: 142,
      },
      {
        fileName: 'Dashboard.tsx',
        route: '/dashboard',
        componentName: 'Dashboard',
        status: 'generating',
      },
      {
        fileName: 'Settings.tsx',
        route: '/settings',
        componentName: 'Settings',
        status: 'pending',
      },
      {
        fileName: 'Profile.tsx',
        route: '/profile',
        componentName: 'Profile',
        status: 'pending',
      },
    ],
  },
}

export const WithError: Story = {
  args: {
    pages: [
      {
        fileName: 'App.tsx',
        route: '/',
        componentName: 'App',
        status: 'complete',
        lineCount: 142,
      },
      {
        fileName: 'Dashboard.tsx',
        route: '/dashboard',
        componentName: 'Dashboard',
        status: 'error',
      },
      {
        fileName: 'Settings.tsx',
        route: '/settings',
        componentName: 'Settings',
        status: 'complete',
        lineCount: 98,
      },
    ],
  },
}

export const NoneStarted: Story = {
  args: {
    pages: [
      {
        fileName: 'App.tsx',
        route: '/',
        componentName: 'App',
        status: 'pending',
      },
      {
        fileName: 'Dashboard.tsx',
        route: '/dashboard',
        componentName: 'Dashboard',
        status: 'pending',
      },
    ],
  },
}
