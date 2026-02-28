import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',

  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(ts|tsx)',
  ],

  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    '@storybook/addon-designs',
  ],

  staticDirs: ['../public'],

  docs: {
    autodocs: 'tag',
  },

  viteFinal: async (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': new URL('../src', import.meta.url).pathname,
      // @storybook/blocks@8 imports storybook/internal/theming which was renamed
      // to storybook/theming in Storybook 10. Alias to fix the resolution.
      'storybook/internal/theming': new URL(
        '../node_modules/storybook/dist/theming/index.js',
        import.meta.url,
      ).pathname,
    }
    return config
  },
}

export default config
