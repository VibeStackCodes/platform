'use client'

import { ChevronRight, Layout } from 'lucide-react'
import type { HTMLAttributes } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface SitemapEntry {
  route: string
  componentName: string
  purpose: string
  sections: string[]
  dataRequirements: string
}

interface ArchitectureSpec {
  archetype: string
  sitemap: SitemapEntry[]
  auth: { required: boolean }
}

export type ArchitectureCardProps = HTMLAttributes<HTMLDivElement> & {
  spec: ArchitectureSpec
}

export function ArchitectureCard({ spec, className, ...props }: ArchitectureCardProps) {
  const { archetype, sitemap } = spec

  return (
    <Card className={cn('shadow-none', className)} {...props}>
      <CardHeader className="pb-0">
        <div className="flex items-center gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layout className="size-4 text-muted-foreground" />
            Architecture
          </CardTitle>
          <Badge variant="secondary" className="font-mono text-xs">
            {archetype}
          </Badge>
          <span className="ml-auto text-muted-foreground text-xs">
            {sitemap.length} pages
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="divide-y rounded-md border">
          {sitemap.map((entry) => (
            <RouteRow key={entry.route} entry={entry} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

type RouteRowProps = {
  entry: SitemapEntry
}

function RouteRow({ entry }: RouteRowProps) {
  const { route, componentName, sections } = entry

  return (
    <Collapsible>
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="font-mono text-sm text-foreground">{route}</span>
        <span className="text-muted-foreground text-sm">{componentName}</span>

        <CollapsibleTrigger className="group ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground">
          <ChevronRight className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
          {sections.length} sections
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="flex flex-wrap gap-1.5 border-t bg-muted/30 px-3 py-2">
          {sections.map((section) => (
            <Badge key={section} variant="outline" className="font-mono text-xs">
              {section}
            </Badge>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
