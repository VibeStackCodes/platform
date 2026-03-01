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
        background: 'oklch(0.1783 0.0128 270.60)',
        foreground: 'oklch(0.9816 0.0018 248.57)',
        primary: 'oklch(0.5854 0.2041 277.12)',
        primaryForeground: 'oklch(1.0000 0 0)',
        secondary: 'oklch(0.2519 0.0226 272.65)',
        accent: 'oklch(0.6610 0.1748 278.95)',
        muted: 'oklch(0.3907 0.0230 264.36)',
        border: 'oklch(0.3907 0.0230 264.36)',
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
        background: 'oklch(1.0000 0 0)',
        foreground: 'oklch(0.2101 0.0318 264.67)',
        primary: 'oklch(0.5461 0.2153 262.89)',
        primaryForeground: 'oklch(1.0000 0 0)',
        secondary: 'oklch(0.9670 0.0030 264.51)',
        accent: 'oklch(0.7137 0.1435 254.63)',
        muted: 'oklch(0.9276 0.0059 264.52)',
        border: 'oklch(0.8717 0.0094 258.38)',
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
        background: 'oklch(0.9835 0.0129 82.40)',
        foreground: 'oklch(0.2284 0.0385 282.93)',
        primary: 'oklch(0.6122 0.2081 22.23)',
        primaryForeground: 'oklch(1.0000 0 0)',
        secondary: 'oklch(0.9014 0.0389 66.01)',
        accent: 'oklch(0.5598 0.0782 238.00)',
        muted: 'oklch(0.9672 0 0)',
        border: 'oklch(0.8302 0.0331 76.39)',
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
