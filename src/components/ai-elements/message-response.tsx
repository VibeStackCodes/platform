'use client'

import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import type { ComponentProps } from 'react'
import { memo } from 'react'
import { Streamdown } from 'streamdown'
import { cn } from '@/lib/utils'

export type MessageResponseProps = ComponentProps<typeof Streamdown>

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- shiki version mismatch between streamdown and @streamdown/code
const streamdownPlugins = { cjk, code, math, mermaid } as any

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn('size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
)

MessageResponse.displayName = 'MessageResponse'
