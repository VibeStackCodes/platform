import '../src/index.css'

import React from 'react'
import type { Preview, ReactRenderer } from '@storybook/react'
import { withThemeByClassName } from '@storybook/addon-themes'
import { TooltipProvider } from '../src/components/ui/tooltip'
import { THEMES, buildStyles } from './themes'

const preview: Preview = {
  globalTypes: {
    themePreset: {
      name: 'Theme Preset',
      description: 'Design system theme',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: 'terracotta', title: 'Terracotta', right: '🟤' },
          { value: 'ocean', title: 'Ocean', right: '🔵' },
          { value: 'forest', title: 'Forest', right: '🟢' },
          { value: 'amethyst', title: 'Amethyst', right: '🟣' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    themePreset: 'terracotta',
  },
  parameters: {
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /date$/i,
      },
    },
    a11y: {
      config: {},
      options: {},
    },
  },
  decorators: [
    // Color mode: light / dark
    withThemeByClassName<ReactRenderer>({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
    }),
    // Theme preset: wraps story with inline CSS variable overrides
    (Story, context) => {
      const preset = (context.globals.themePreset as string) || 'terracotta'
      const isDark = context.globals.theme === 'dark'
      const theme = THEMES[preset]
      if (!theme) return React.createElement(Story)

      const vars = isDark ? theme.dark : theme.light
      if (Object.keys(vars).length === 0) {
        return React.createElement(Story)
      }

      const styles = buildStyles(vars)
      return React.createElement('div', { style: styles }, React.createElement(Story))
    },
    // Radix TooltipProvider
    (Story) => React.createElement(TooltipProvider, null, React.createElement(Story)),
  ],
  tags: ['autodocs'],
}

export default preview
