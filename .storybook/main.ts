import type { StorybookConfig } from '@storybook/react-vite'
import remarkGfm from 'remark-gfm'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',

  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],

  addons: [
    {
      name: '@storybook/addon-docs',
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm],
          },
        },
      },
    },
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
      // Storybook 10 merged @storybook/blocks into @storybook/addon-docs/blocks.
      // Alias so any residual imports (MDX, internal) still resolve.
      '@storybook/blocks': new URL(
        '../node_modules/@storybook/addon-docs/dist/blocks.js',
        import.meta.url,
      ).pathname,
    }
    return config
  },
}

export default config
