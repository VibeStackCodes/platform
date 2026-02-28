import type { Meta, StoryObj } from '@storybook/react'
import { Image } from './image'

// Small SVG encoded as base64 (a blue square with "AI" text)
const SVG_BASE64 = btoa(`
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <rect width="200" height="200" fill="#3b82f6" rx="12"/>
  <text x="100" y="115" font-size="48" text-anchor="middle" fill="white">AI</text>
</svg>
`)

// Minimal 1x1 red PNG in base64
const RED_PIXEL_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=='

const emptyUint8Array = new Uint8Array(0)

const meta = {
  title: 'AI/Image',
  component: Image,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    uint8Array: emptyUint8Array,
  },
} satisfies Meta<typeof Image>

export default meta
type Story = StoryObj<typeof meta>

export const SvgImage: Story = {
  args: {
    base64: SVG_BASE64,
    uint8Array: emptyUint8Array,
    mediaType: 'image/svg+xml',
    alt: 'Blue square with AI text',
  },
}

export const PngPixel: Story = {
  args: {
    base64: RED_PIXEL_BASE64,
    uint8Array: emptyUint8Array,
    mediaType: 'image/png',
    alt: 'A 1x1 red pixel',
  },
}

export const WithCustomClassName: Story = {
  args: {
    base64: SVG_BASE64,
    uint8Array: emptyUint8Array,
    mediaType: 'image/svg+xml',
    alt: 'Styled image with ring',
    className: 'rounded-xl shadow-lg ring-2 ring-blue-500',
  },
}

export const SmallThumbnail: Story = {
  args: {
    base64: SVG_BASE64,
    uint8Array: emptyUint8Array,
    mediaType: 'image/svg+xml',
    alt: 'Small thumbnail',
    className: 'w-16 h-16',
  },
}
