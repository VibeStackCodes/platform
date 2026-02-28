import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
  WebPreviewBody,
  WebPreviewConsole,
} from './web-preview'
import { RefreshCcwIcon, ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'

const meta = {
  title: 'AI/WebPreview',
  component: WebPreview,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof WebPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div className="h-96 w-full max-w-2xl">
      <WebPreview defaultUrl="about:blank" onUrlChange={fn()}>
        <WebPreviewNavigation>
          <WebPreviewNavigationButton tooltip="Go back" disabled>
            <ArrowLeftIcon className="size-4" />
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton tooltip="Go forward" disabled>
            <ArrowRightIcon className="size-4" />
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton tooltip="Refresh">
            <RefreshCcwIcon className="size-4" />
          </WebPreviewNavigationButton>
          <WebPreviewUrl />
        </WebPreviewNavigation>
        <WebPreviewBody />
      </WebPreview>
    </div>
  ),
}

export const WithUrl: Story = {
  render: () => (
    <div className="h-96 w-full max-w-2xl">
      <WebPreview defaultUrl="https://example.com" onUrlChange={fn()}>
        <WebPreviewNavigation>
          <WebPreviewNavigationButton tooltip="Refresh">
            <RefreshCcwIcon className="size-4" />
          </WebPreviewNavigationButton>
          <WebPreviewUrl />
        </WebPreviewNavigation>
        <WebPreviewBody />
      </WebPreview>
    </div>
  ),
}

export const WithConsole: Story = {
  render: () => (
    <div className="h-[500px] w-full max-w-2xl">
      <WebPreview defaultUrl="about:blank">
        <WebPreviewNavigation>
          <WebPreviewNavigationButton tooltip="Refresh">
            <RefreshCcwIcon className="size-4" />
          </WebPreviewNavigationButton>
          <WebPreviewUrl />
        </WebPreviewNavigation>
        <WebPreviewBody />
        <WebPreviewConsole
          logs={[
            { level: 'log', message: 'App initialized', timestamp: new Date() },
            { level: 'warn', message: 'Missing prop: className', timestamp: new Date() },
            { level: 'error', message: 'TypeError: Cannot read property of undefined', timestamp: new Date() },
          ]}
        />
      </WebPreview>
    </div>
  ),
}

export const EmptyConsole: Story = {
  render: () => (
    <div className="h-[500px] w-full max-w-2xl">
      <WebPreview defaultUrl="about:blank">
        <WebPreviewNavigation>
          <WebPreviewUrl />
        </WebPreviewNavigation>
        <WebPreviewBody />
        <WebPreviewConsole logs={[]} />
      </WebPreview>
    </div>
  ),
}
