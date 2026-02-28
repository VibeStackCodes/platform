import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import type { AttachmentData } from './attachments'
import {
  Attachment,
  AttachmentEmpty,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from './attachments'

const meta = {
  title: 'AI/Attachments',
  component: Attachments,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Attachments>

export default meta
type Story = StoryObj<typeof meta>

const imageFile = {
  id: 'file-1',
  type: 'file',
  mediaType: 'image/png',
  filename: 'screenshot.png',
  url: 'https://picsum.photos/200/200',
} as AttachmentData

const docFile = {
  id: 'file-2',
  type: 'file',
  mediaType: 'application/pdf',
  filename: 'requirements.pdf',
} as AttachmentData

const audioFile = {
  id: 'file-3',
  type: 'file',
  mediaType: 'audio/mp3',
  filename: 'recording.mp3',
} as AttachmentData

const sourceDoc = {
  id: 'source-1',
  type: 'source-document',
  title: 'React Documentation',
  filename: 'react-docs.html',
  url: 'https://react.dev',
} as unknown as AttachmentData

export const GridVariant: Story = {
  args: { variant: 'grid' },
  render: (args) => (
    <Attachments {...args}>
      <Attachment data={imageFile} onRemove={fn()}>
        <AttachmentPreview />
        <AttachmentRemove />
      </Attachment>
      <Attachment data={docFile} onRemove={fn()}>
        <AttachmentPreview />
        <AttachmentRemove />
      </Attachment>
      <Attachment data={audioFile} onRemove={fn()}>
        <AttachmentPreview />
        <AttachmentRemove />
      </Attachment>
    </Attachments>
  ),
}

export const InlineVariant: Story = {
  args: { variant: 'inline' },
  render: (args) => (
    <Attachments {...args}>
      <Attachment data={imageFile}>
        <AttachmentPreview />
        <AttachmentInfo />
      </Attachment>
      <Attachment data={docFile}>
        <AttachmentPreview />
        <AttachmentInfo />
      </Attachment>
      <Attachment data={sourceDoc}>
        <AttachmentPreview />
        <AttachmentInfo />
      </Attachment>
    </Attachments>
  ),
}

export const ListVariant: Story = {
  args: { variant: 'list' },
  render: (args) => (
    <Attachments {...args}>
      <Attachment data={imageFile} onRemove={fn()}>
        <AttachmentPreview />
        <AttachmentInfo showMediaType />
        <AttachmentRemove />
      </Attachment>
      <Attachment data={docFile} onRemove={fn()}>
        <AttachmentPreview />
        <AttachmentInfo showMediaType />
        <AttachmentRemove />
      </Attachment>
      <Attachment data={audioFile} onRemove={fn()}>
        <AttachmentPreview />
        <AttachmentInfo showMediaType />
        <AttachmentRemove />
      </Attachment>
    </Attachments>
  ),
}

export const EmptyState: Story = {
  args: { variant: 'list' },
  render: (args) => (
    <Attachments {...args}>
      <AttachmentEmpty />
    </Attachments>
  ),
}

export const GridWithImage: Story = {
  args: { variant: 'grid' },
  render: (args) => (
    <Attachments {...args}>
      <Attachment
        data={
          {
            id: 'img-1',
            type: 'file',
            mediaType: 'image/jpeg',
            filename: 'photo.jpg',
            url: 'https://picsum.photos/300/200',
          } as AttachmentData
        }
        onRemove={fn()}
      >
        <AttachmentPreview />
        <AttachmentRemove />
      </Attachment>
    </Attachments>
  ),
}
