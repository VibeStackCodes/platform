import type { Meta, StoryObj } from '@storybook/react'
import { Sources, SourcesTrigger, SourcesContent, Source } from './sources'

const meta = {
  title: 'AI/Sources',
  component: Sources,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Sources>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Sources>
      <SourcesTrigger count={3} />
      <SourcesContent>
        <Source
          href="https://react.dev/blog/2024/12/05/react-19"
          title="React 19 Release Notes"
        />
        <Source
          href="https://tailwindcss.com/blog/tailwindcss-v4"
          title="Tailwind CSS v4 Documentation"
        />
        <Source
          href="https://vite.dev/guide/migration"
          title="Vite 7 Migration Guide"
        />
      </SourcesContent>
    </Sources>
  ),
}

export const SingleSource: Story = {
  render: () => (
    <Sources>
      <SourcesTrigger count={1} />
      <SourcesContent>
        <Source
          href="https://react.dev"
          title="React Documentation"
        />
      </SourcesContent>
    </Sources>
  ),
}

export const ManySources: Story = {
  render: () => (
    <Sources>
      <SourcesTrigger count={6} />
      <SourcesContent>
        {[
          { href: 'https://react.dev', title: 'React Docs' },
          { href: 'https://tailwindcss.com', title: 'Tailwind CSS' },
          { href: 'https://vite.dev', title: 'Vite' },
          { href: 'https://tanstack.com', title: 'TanStack' },
          { href: 'https://radix-ui.com', title: 'Radix UI' },
          { href: 'https://ui.shadcn.com', title: 'shadcn/ui' },
        ].map((source) => (
          <Source key={source.href} href={source.href} title={source.title} />
        ))}
      </SourcesContent>
    </Sources>
  ),
}

// Sources wraps Collapsible — defaultOpen must be passed via data attribute workaround.
// We demonstrate the open state by using the Storybook-level default story instead.
export const PreExpanded: Story = {
  render: () => {
    // Render a standalone collapsible in open state by using Radix open prop directly
    return (
      <div className="space-y-1">
        <Sources>
          <SourcesTrigger count={2} />
          <SourcesContent>
            <Source href="https://react.dev" title="React Documentation" />
            <Source href="https://tailwindcss.com" title="Tailwind CSS" />
          </SourcesContent>
        </Sources>
        <p className="text-xs text-muted-foreground">
          Click the trigger above to expand the sources list.
        </p>
      </div>
    )
  },
}
