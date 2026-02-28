import type { Meta, StoryObj } from '@storybook/react'
import { ThemeTokensCard } from './theme-tokens-card'

const meta = {
  title: 'AI/ThemeTokensCard',
  component: ThemeTokensCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ThemeTokensCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    tokens: {
      name: 'Midnight SaaS',
      colors: {
        background: '#0f1117',
        foreground: '#f8f9fa',
        primary: '#6366f1',
        primaryForeground: '#ffffff',
        secondary: '#1e2130',
        accent: '#818cf8',
        muted: '#374151',
        border: '#374151',
      },
      fonts: {
        display: 'Inter',
        body: 'Inter',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      style: {
        borderRadius: '0.5rem',
        cardStyle: 'bordered',
        navStyle: 'sidebar',
        heroLayout: 'split',
        spacing: 'normal',
        motion: 'subtle',
        imagery: 'minimal',
      },
      authPosture: 'authenticated',
      textSlots: {
        headline: 'Build faster with AI',
        subheadline: 'The platform that thinks with you',
      },
      aestheticDirection: 'Dark enterprise with vivid accent pops',
      layoutStrategy: 'Fixed sidebar, fluid content area',
      signatureDetail: 'Gradient borders on cards',
    },
  },
}

export const LightMinimal: Story = {
  args: {
    tokens: {
      name: 'Clean Light',
      colors: {
        background: '#ffffff',
        foreground: '#111827',
        primary: '#2563eb',
        primaryForeground: '#ffffff',
        secondary: '#f3f4f6',
        accent: '#60a5fa',
        muted: '#e5e7eb',
        border: '#d1d5db',
      },
      fonts: {
        display: 'Geist',
        body: 'Geist',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap',
      },
      style: {
        borderRadius: '0.75rem',
        cardStyle: 'elevated',
        navStyle: 'top-bar',
        heroLayout: 'centered',
        spacing: 'loose',
        motion: 'none',
        imagery: 'icon-driven',
      },
      authPosture: 'public',
      textSlots: {
        headline: 'Simple. Powerful. Yours.',
      },
    },
  },
}

export const BoldExpressive: Story = {
  args: {
    tokens: {
      name: 'Bold Brand',
      colors: {
        background: '#fef9f0',
        foreground: '#1a1a2e',
        primary: '#e63946',
        primaryForeground: '#ffffff',
        secondary: '#f1dac4',
        accent: '#457b9d',
        muted: '#f4f4f4',
        border: '#d4c5b0',
      },
      fonts: {
        display: 'Playfair Display',
        body: 'Lato',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@400;700&display=swap',
      },
      style: {
        borderRadius: '0.25rem',
        cardStyle: 'flat',
        navStyle: 'minimal',
        heroLayout: 'fullbleed',
        spacing: 'compact',
        motion: 'expressive',
        imagery: 'photography-heavy',
      },
      authPosture: 'mixed',
      textSlots: {
        headline: 'Crafted for creators',
        tagline: 'Art meets technology',
      },
      aestheticDirection: 'Editorial magazine feel',
      layoutStrategy: 'Full-bleed hero with editorial grid',
      signatureDetail: 'Serif display type paired with sans body',
    },
  },
}
