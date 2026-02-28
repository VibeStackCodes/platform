import type { Meta, StoryObj } from '@storybook/react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

const meta = {
  title: 'UI/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

// ── variant: default ──────────────────────────────────────────────────────────

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[420px]">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
      </TabsList>
      <TabsContent value="account" className="p-4">
        <p className="text-sm text-muted-foreground">
          Manage your account settings, display name, and email address here.
        </p>
      </TabsContent>
      <TabsContent value="billing" className="p-4">
        <p className="text-sm text-muted-foreground">
          View your current plan, credit balance, and payment history.
        </p>
      </TabsContent>
      <TabsContent value="notifications" className="p-4">
        <p className="text-sm text-muted-foreground">
          Configure email and in-app notification preferences.
        </p>
      </TabsContent>
    </Tabs>
  ),
}

// ── variant: line ─────────────────────────────────────────────────────────────

export const LineVariant: Story = {
  name: 'Variant / Line',
  render: () => (
    <Tabs defaultValue="preview" className="w-[420px]">
      <TabsList variant="line">
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
        <TabsTrigger value="docs">Docs</TabsTrigger>
      </TabsList>
      <TabsContent value="preview" className="p-4">
        <p className="text-sm text-muted-foreground">
          Live rendered output of the generated component.
        </p>
      </TabsContent>
      <TabsContent value="code" className="p-4">
        <p className="text-sm font-mono text-muted-foreground">
          {'// Generated source code appears here'}
        </p>
      </TabsContent>
      <TabsContent value="docs" className="p-4">
        <p className="text-sm text-muted-foreground">
          Auto-generated documentation from prop types and JSDoc comments.
        </p>
      </TabsContent>
    </Tabs>
  ),
}

// ── orientation: vertical ─────────────────────────────────────────────────────

export const Vertical: Story = {
  name: 'Orientation / Vertical',
  render: () => (
    <Tabs defaultValue="general" orientation="vertical" className="w-[480px]">
      <TabsList className="w-36">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="p-4">
        <p className="text-sm text-muted-foreground">
          General settings for your workspace and project defaults.
        </p>
      </TabsContent>
      <TabsContent value="security" className="p-4">
        <p className="text-sm text-muted-foreground">
          Two-factor authentication, session management, and API keys.
        </p>
      </TabsContent>
      <TabsContent value="integrations" className="p-4">
        <p className="text-sm text-muted-foreground">
          Connect GitHub, Vercel, Stripe, and other third-party services.
        </p>
      </TabsContent>
    </Tabs>
  ),
}

// ── disabled trigger ──────────────────────────────────────────────────────────

export const WithDisabledTab: Story = {
  name: 'With Disabled Tab',
  render: () => (
    <Tabs defaultValue="active" className="w-[420px]">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="beta" disabled>
          Beta (coming soon)
        </TabsTrigger>
        <TabsTrigger value="archived">Archived</TabsTrigger>
      </TabsList>
      <TabsContent value="active" className="p-4">
        <p className="text-sm text-muted-foreground">Your active projects.</p>
      </TabsContent>
      <TabsContent value="archived" className="p-4">
        <p className="text-sm text-muted-foreground">Your archived projects.</p>
      </TabsContent>
    </Tabs>
  ),
}
