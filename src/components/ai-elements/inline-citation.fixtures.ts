export interface CitationSource {
  title: string
  url: string
  description: string
  quote?: string
}

export const citationSources: CitationSource[] = [
  {
    title: 'React 19 Release Notes',
    url: 'https://react.dev/blog/2024/12/05/react-19',
    description:
      'React 19 is now available! In this post we will give an overview of the new features in React 19, and how you can adopt them.',
    quote: 'React 19 includes improvements that have been in the works for years.',
  },
  {
    title: 'Tailwind CSS v4 Documentation',
    url: 'https://tailwindcss.com/blog/tailwindcss-v4',
    description:
      'Tailwind CSS v4.0 is here. A high-performance engine, a streamlined developer experience, and a CSS-first configuration approach.',
    quote: 'Tailwind CSS v4 is a complete reimagination of the framework.',
  },
  {
    title: 'Vite 7 Migration Guide',
    url: 'https://vite.dev/guide/migration',
    description:
      'This page covers all the breaking changes compared to previous Vite versions to help you migrate.',
  },
]

export const singleSource = [citationSources[0]]
export const multipleSourceUrls = citationSources.map((s) => s.url)
