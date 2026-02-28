import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import {
  Commit,
  CommitActions,
  CommitAuthor,
  CommitAuthorAvatar,
  CommitContent,
  CommitCopyButton,
  CommitFile,
  CommitFileAdditions,
  CommitFileChanges,
  CommitFileDeletions,
  CommitFileIcon,
  CommitFileInfo,
  CommitFilePath,
  CommitFiles,
  CommitFileStatus,
  CommitHash,
  CommitHeader,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
  CommitSeparator,
  CommitTimestamp,
} from './commit'

const meta = {
  title: 'AI/Commit',
  component: Commit,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Commit>

export default meta
type Story = StoryObj<typeof meta>

const sampleDate = new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago

export const Default: Story = {
  render: () => (
    <Commit style={{ maxWidth: 600 }}>
      <CommitHeader>
        <CommitAuthor>
          <CommitAuthorAvatar initials="JD" />
        </CommitAuthor>
        <CommitInfo>
          <CommitMessage>feat: add dashboard metrics component</CommitMessage>
          <CommitMetadata>
            <CommitHash>a1b2c3d</CommitHash>
            <CommitSeparator />
            <CommitTimestamp date={sampleDate} />
          </CommitMetadata>
        </CommitInfo>
        <CommitActions>
          <CommitCopyButton hash="a1b2c3d" onCopy={fn()} />
        </CommitActions>
      </CommitHeader>
    </Commit>
  ),
}

export const Expanded: Story = {
  render: () => (
    <Commit defaultOpen style={{ maxWidth: 600 }}>
      <CommitHeader>
        <CommitAuthor>
          <CommitAuthorAvatar initials="SB" />
        </CommitAuthor>
        <CommitInfo>
          <CommitMessage>fix: resolve race condition in SSE handler</CommitMessage>
          <CommitMetadata>
            <CommitHash>f8e9d0c</CommitHash>
            <CommitSeparator />
            <CommitTimestamp date={new Date(Date.now() - 1000 * 60 * 30)} />
          </CommitMetadata>
        </CommitInfo>
        <CommitActions>
          <CommitCopyButton hash="f8e9d0c" onCopy={fn()} />
        </CommitActions>
      </CommitHeader>
      <CommitContent>
        <CommitFiles>
          <CommitFile>
            <CommitFileInfo>
              <CommitFileStatus status="modified" />
              <CommitFileIcon />
              <CommitFilePath>server/routes/agent.ts</CommitFilePath>
            </CommitFileInfo>
            <CommitFileChanges>
              <CommitFileAdditions count={12} />
              <CommitFileDeletions count={4} />
            </CommitFileChanges>
          </CommitFile>
          <CommitFile>
            <CommitFileInfo>
              <CommitFileStatus status="modified" />
              <CommitFileIcon />
              <CommitFilePath>server/lib/sse.ts</CommitFilePath>
            </CommitFileInfo>
            <CommitFileChanges>
              <CommitFileAdditions count={3} />
              <CommitFileDeletions count={1} />
            </CommitFileChanges>
          </CommitFile>
          <CommitFile>
            <CommitFileInfo>
              <CommitFileStatus status="added" />
              <CommitFileIcon />
              <CommitFilePath>tests/sse.test.ts</CommitFilePath>
            </CommitFileInfo>
            <CommitFileChanges>
              <CommitFileAdditions count={48} />
            </CommitFileChanges>
          </CommitFile>
        </CommitFiles>
      </CommitContent>
    </Commit>
  ),
}

export const AllFileStatuses: Story = {
  render: () => (
    <Commit defaultOpen style={{ maxWidth: 600 }}>
      <CommitHeader>
        <CommitAuthor>
          <CommitAuthorAvatar initials="AI" />
        </CommitAuthor>
        <CommitInfo>
          <CommitMessage>refactor: restructure project layout</CommitMessage>
          <CommitMetadata>
            <CommitHash>c4d5e6f</CommitHash>
            <CommitSeparator />
            <CommitTimestamp date={new Date(Date.now() - 1000 * 60 * 60 * 24)} />
          </CommitMetadata>
        </CommitInfo>
      </CommitHeader>
      <CommitContent>
        <CommitFiles>
          <CommitFile>
            <CommitFileInfo>
              <CommitFileStatus status="added" />
              <CommitFileIcon />
              <CommitFilePath>src/features/auth/index.ts</CommitFilePath>
            </CommitFileInfo>
            <CommitFileChanges>
              <CommitFileAdditions count={120} />
            </CommitFileChanges>
          </CommitFile>
          <CommitFile>
            <CommitFileInfo>
              <CommitFileStatus status="modified" />
              <CommitFileIcon />
              <CommitFilePath>src/App.tsx</CommitFilePath>
            </CommitFileInfo>
            <CommitFileChanges>
              <CommitFileAdditions count={5} />
              <CommitFileDeletions count={15} />
            </CommitFileChanges>
          </CommitFile>
          <CommitFile>
            <CommitFileInfo>
              <CommitFileStatus status="renamed" />
              <CommitFileIcon />
              <CommitFilePath>src/features/dashboard/Dashboard.tsx</CommitFilePath>
            </CommitFileInfo>
            <CommitFileChanges>
              <CommitFileAdditions count={0} />
              <CommitFileDeletions count={0} />
            </CommitFileChanges>
          </CommitFile>
          <CommitFile>
            <CommitFileInfo>
              <CommitFileStatus status="deleted" />
              <CommitFileIcon />
              <CommitFilePath>src/pages/OldDashboard.tsx</CommitFilePath>
            </CommitFileInfo>
            <CommitFileChanges>
              <CommitFileDeletions count={248} />
            </CommitFileChanges>
          </CommitFile>
        </CommitFiles>
      </CommitContent>
    </Commit>
  ),
}
