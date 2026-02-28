import type { Meta, StoryObj } from '@storybook/react'
import {
  PackageInfo,
  PackageInfoChangeType,
  PackageInfoContent,
  PackageInfoDependencies,
  PackageInfoDependency,
  PackageInfoDescription,
  PackageInfoHeader,
  PackageInfoName,
  PackageInfoVersion,
} from './package-info'

const meta = {
  title: 'AI/PackageInfo',
  component: PackageInfo,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PackageInfo>

export default meta
type Story = StoryObj<typeof meta>

export const Added: Story = {
  args: {
    name: 'framer-motion',
    newVersion: '11.2.0',
    changeType: 'added',
  },
}

export const Updated: Story = {
  args: {
    name: 'react',
    currentVersion: '18.3.1',
    newVersion: '19.0.0',
    changeType: 'major',
  },
}

export const MinorUpdate: Story = {
  args: {
    name: 'tailwindcss',
    currentVersion: '4.0.0',
    newVersion: '4.1.2',
    changeType: 'minor',
  },
}

export const PatchUpdate: Story = {
  args: {
    name: '@radix-ui/react-dialog',
    currentVersion: '1.0.4',
    newVersion: '1.0.5',
    changeType: 'patch',
  },
}

export const Removed: Story = {
  args: {
    name: 'lodash',
    currentVersion: '4.17.21',
    changeType: 'removed',
  },
}

export const WithDescription: Story = {
  args: {
    name: 'zod',
    newVersion: '3.23.8',
    changeType: 'added',
  },
  render: (args) => (
    <PackageInfo {...args}>
      <PackageInfoHeader>
        <PackageInfoName />
        <PackageInfoChangeType />
      </PackageInfoHeader>
      <PackageInfoVersion />
      <PackageInfoDescription>
        TypeScript-first schema validation with static type inference
      </PackageInfoDescription>
    </PackageInfo>
  ),
}

export const WithDependencies: Story = {
  args: {
    name: 'react-hook-form',
    newVersion: '7.51.0',
    changeType: 'added',
  },
  render: (args) => (
    <PackageInfo {...args}>
      <PackageInfoHeader>
        <PackageInfoName />
        <PackageInfoChangeType />
      </PackageInfoHeader>
      <PackageInfoVersion />
      <PackageInfoDescription>
        Performant, flexible and extensible forms with easy-to-use validation.
      </PackageInfoDescription>
      <PackageInfoContent>
        <PackageInfoDependencies>
          <PackageInfoDependency name="react" version="^18.0.0 || ^19.0.0" />
          <PackageInfoDependency name="react-dom" version="^18.0.0 || ^19.0.0" />
        </PackageInfoDependencies>
      </PackageInfoContent>
    </PackageInfo>
  ),
}

export const NoVersion: Story = {
  args: {
    name: 'typescript',
    changeType: 'added',
  },
}
