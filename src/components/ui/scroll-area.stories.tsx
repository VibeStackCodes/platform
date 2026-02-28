import type { Meta, StoryObj } from '@storybook/react'

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const meta = {
  title: 'UI/ScrollArea',
  component: ScrollArea,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ScrollArea>

export default meta
type Story = StoryObj<typeof meta>

const tags = [
  'v1.2.0-beta',
  'v1.1.0',
  'v1.0.0',
  'v0.9.0',
  'v0.8.2',
  'v0.8.1',
  'v0.8.0',
  'v0.7.0',
  'v0.6.0',
  'v0.5.0',
  'v0.4.0',
  'v0.3.0',
  'v0.2.0',
  'v0.1.0',
  'v0.0.1',
]

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-72 w-48 rounded-md border">
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Tags</h4>
        {tags.map((tag) => (
          <div key={tag}>
            <div className="text-sm">{tag}</div>
            <Separator className="my-2" />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const LargeContent: Story = {
  render: () => (
    <ScrollArea className="h-[300px] w-[350px] rounded-md border p-4">
      <div className="space-y-4">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="rounded-md bg-muted p-3">
            <p className="text-sm font-medium">Item {i + 1}</p>
            <p className="text-xs text-muted-foreground">
              Description for item {i + 1}. This is some placeholder content to
              make the scroll area meaningful.
            </p>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const HorizontalScroll: Story = {
  render: () => (
    <ScrollArea className="w-96 whitespace-nowrap rounded-md border">
      <div className="flex w-max gap-4 p-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="flex w-32 shrink-0 flex-col items-center justify-center rounded-md border bg-muted/40 p-4"
          >
            <div className="size-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500" />
            <p className="mt-2 text-xs font-medium">Card {i + 1}</p>
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
}

export const CodeBlock: Story = {
  render: () => (
    <ScrollArea className="h-[200px] w-[500px] rounded-md border bg-muted">
      <pre className="p-4 text-xs">
        {`import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return { user, loading, signOut }
}`}
      </pre>
    </ScrollArea>
  ),
}
