import type { Meta, StoryObj } from '@storybook/react'
import { FileAssemblyCard } from './file-assembly-card'

const meta = {
  title: 'AI/FileAssemblyCard',
  component: FileAssemblyCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FileAssemblyCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    files: [
      { path: 'vite.config.ts', category: 'config' },
      { path: 'tailwind.config.ts', category: 'config' },
      { path: 'src/index.css', category: 'style' },
      { path: 'src/App.tsx', category: 'wiring' },
      { path: 'src/main.tsx', category: 'wiring' },
      { path: 'src/components/ui/button.tsx', category: 'ui-kit' },
      { path: 'src/components/ui/card.tsx', category: 'ui-kit' },
      { path: 'src/pages/Dashboard.tsx', category: 'route' },
    ],
  },
}

export const ConfigOnly: Story = {
  args: {
    files: [
      { path: 'package.json', category: 'config' },
      { path: 'tsconfig.json', category: 'config' },
      { path: 'vite.config.ts', category: 'config' },
      { path: '.env.example', category: 'config' },
    ],
  },
}

export const FullScaffold: Story = {
  args: {
    files: [
      { path: 'vite.config.ts', category: 'config' },
      { path: 'tsconfig.json', category: 'config' },
      { path: 'package.json', category: 'config' },
      { path: 'src/index.css', category: 'style' },
      { path: 'src/main.tsx', category: 'wiring' },
      { path: 'src/App.tsx', category: 'wiring' },
      { path: 'src/components/ui/button.tsx', category: 'ui-kit' },
      { path: 'src/components/ui/input.tsx', category: 'ui-kit' },
      { path: 'src/components/ui/card.tsx', category: 'ui-kit' },
      { path: 'src/pages/Home.tsx', category: 'route' },
      { path: 'src/pages/Dashboard.tsx', category: 'route' },
      { path: 'src/pages/Settings.tsx', category: 'route' },
      { path: 'supabase/migrations/0001_init.sql', category: 'migration' },
    ],
  },
}
