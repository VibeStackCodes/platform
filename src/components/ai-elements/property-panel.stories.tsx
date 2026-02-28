import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { PropertyPanel } from './property-panel'
import type { ElementContext } from '@/lib/types'

const baseElement: ElementContext = {
  fileName: 'src/components/Hero.tsx',
  lineNumber: 42,
  columnNumber: 6,
  tagName: 'h1',
  className: 'text-4xl font-bold text-foreground',
  textContent: 'Welcome to VibeStack',
  tailwindClasses: ['text-4xl', 'font-bold', 'text-foreground'],
  rect: { x: 40, y: 120, width: 600, height: 56 },
  computedStyles: {
    color: 'rgb(15, 23, 42)',
    backgroundColor: 'transparent',
    fontSize: '36px',
    fontWeight: '700',
    padding: '0px',
    margin: '0px',
    textAlign: 'left',
  },
}

const buttonElement: ElementContext = {
  fileName: 'src/components/CTA.tsx',
  lineNumber: 18,
  columnNumber: 10,
  tagName: 'button',
  className: 'px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90',
  textContent: 'Get Started Free',
  tailwindClasses: ['px-6', 'py-3', 'rounded-lg', 'bg-primary', 'text-primary-foreground'],
  rect: { x: 40, y: 300, width: 180, height: 48 },
  computedStyles: {
    color: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(99, 102, 241)',
    fontSize: '16px',
    fontWeight: '500',
    padding: '12px 24px',
    margin: '0px',
    textAlign: 'center',
  },
}

const paragraphElement: ElementContext = {
  fileName: 'src/pages/About.tsx',
  lineNumber: 7,
  columnNumber: 4,
  tagName: 'p',
  className: 'text-muted-foreground text-lg leading-relaxed',
  textContent: 'Build beautiful apps with AI assistance.',
  tailwindClasses: ['text-muted-foreground', 'text-lg', 'leading-relaxed'],
  rect: { x: 40, y: 200, width: 500, height: 28 },
}

const meta = {
  title: 'AI/PropertyPanel',
  component: PropertyPanel,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onApply: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof PropertyPanel>

export default meta
type Story = StoryObj<typeof meta>

export const HeadingElement: Story = {
  args: {
    element: baseElement,
  },
}

export const ButtonElement: Story = {
  args: {
    element: buttonElement,
  },
}

export const ParagraphElement: Story = {
  args: {
    element: paragraphElement,
  },
}

export const LongFileName: Story = {
  args: {
    element: {
      ...baseElement,
      fileName: 'src/features/auth/components/login/LoginFormContainer.tsx',
      lineNumber: 123,
    },
  },
}

export const NoComputedStyles: Story = {
  args: {
    element: {
      ...paragraphElement,
      computedStyles: undefined,
    },
  },
}
