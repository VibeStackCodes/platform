import '../src/index.css'

import React from 'react'
import type { Preview, ReactRenderer } from '@storybook/react'
import { withThemeByClassName } from '@storybook/addon-themes'
import { TooltipProvider } from '../src/components/ui/tooltip'

const preview: Preview = {
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
    withThemeByClassName<ReactRenderer>({
      themes: {
        light: 'light',
        dark: 'dark',
      },
      defaultTheme: 'light',
    }),
    (Story) => React.createElement(TooltipProvider, null, React.createElement(Story)),
  ],
  tags: ['autodocs'],
}

export default preview
