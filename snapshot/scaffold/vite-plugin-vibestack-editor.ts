import type { Plugin } from 'vite'

export function vibestackEditor(): Plugin {
  return {
    name: 'vibestack-editor',
    apply: 'serve', // dev only
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `<script type="module" src="/src/__vibestack-preload.ts"></script>\n</head>`,
      )
    },
  }
}
