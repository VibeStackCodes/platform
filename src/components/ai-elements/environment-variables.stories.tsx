import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import {
  EnvironmentVariable,
  EnvironmentVariableCopyButton,
  EnvironmentVariableGroup,
  EnvironmentVariableName,
  EnvironmentVariableRequired,
  EnvironmentVariableValue,
  EnvironmentVariables,
  EnvironmentVariablesContent,
  EnvironmentVariablesHeader,
  EnvironmentVariablesTitle,
  EnvironmentVariablesToggle,
} from './environment-variables'

const meta = {
  title: 'AI/EnvironmentVariables',
  component: EnvironmentVariables,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof EnvironmentVariables>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <EnvironmentVariables style={{ maxWidth: 500 }}>
      <EnvironmentVariablesHeader>
        <EnvironmentVariablesTitle />
        <EnvironmentVariablesToggle />
      </EnvironmentVariablesHeader>
      <EnvironmentVariablesContent>
        <EnvironmentVariable name="VITE_SUPABASE_URL" value="https://xyzcompany.supabase.co">
          <EnvironmentVariableGroup>
            <EnvironmentVariableName />
            <EnvironmentVariableRequired />
          </EnvironmentVariableGroup>
          <EnvironmentVariableGroup>
            <EnvironmentVariableValue />
            <EnvironmentVariableCopyButton onCopy={fn()} />
          </EnvironmentVariableGroup>
        </EnvironmentVariable>
        <EnvironmentVariable name="VITE_SUPABASE_ANON_KEY" value="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123">
          <EnvironmentVariableGroup>
            <EnvironmentVariableName />
            <EnvironmentVariableRequired />
          </EnvironmentVariableGroup>
          <EnvironmentVariableGroup>
            <EnvironmentVariableValue />
            <EnvironmentVariableCopyButton onCopy={fn()} />
          </EnvironmentVariableGroup>
        </EnvironmentVariable>
        <EnvironmentVariable name="OPENAI_API_KEY" value="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
          <EnvironmentVariableGroup>
            <EnvironmentVariableName />
            <EnvironmentVariableRequired />
          </EnvironmentVariableGroup>
          <EnvironmentVariableGroup>
            <EnvironmentVariableValue />
            <EnvironmentVariableCopyButton onCopy={fn()} />
          </EnvironmentVariableGroup>
        </EnvironmentVariable>
        <EnvironmentVariable name="STRIPE_SECRET_KEY" value="sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
          <EnvironmentVariableGroup>
            <EnvironmentVariableName />
          </EnvironmentVariableGroup>
          <EnvironmentVariableGroup>
            <EnvironmentVariableValue />
            <EnvironmentVariableCopyButton onCopy={fn()} />
          </EnvironmentVariableGroup>
        </EnvironmentVariable>
      </EnvironmentVariablesContent>
    </EnvironmentVariables>
  ),
}

export const ValuesVisible: Story = {
  args: {
    defaultShowValues: true,
  },
  render: (args) => (
    <EnvironmentVariables {...args} style={{ maxWidth: 500 }}>
      <EnvironmentVariablesHeader>
        <EnvironmentVariablesTitle />
        <EnvironmentVariablesToggle />
      </EnvironmentVariablesHeader>
      <EnvironmentVariablesContent>
        <EnvironmentVariable name="DATABASE_URL" value="postgresql://user:password@localhost:5432/mydb">
          <EnvironmentVariableName />
          <EnvironmentVariableGroup>
            <EnvironmentVariableValue />
            <EnvironmentVariableCopyButton copyFormat="export" onCopy={fn()} />
          </EnvironmentVariableGroup>
        </EnvironmentVariable>
        <EnvironmentVariable name="REDIS_URL" value="redis://localhost:6379">
          <EnvironmentVariableName />
          <EnvironmentVariableGroup>
            <EnvironmentVariableValue />
            <EnvironmentVariableCopyButton copyFormat="export" onCopy={fn()} />
          </EnvironmentVariableGroup>
        </EnvironmentVariable>
      </EnvironmentVariablesContent>
    </EnvironmentVariables>
  ),
}

export const ControlledVisibility: Story = {
  args: {
    showValues: false,
    onShowValuesChange: fn(),
  },
  render: (args) => (
    <EnvironmentVariables {...args} style={{ maxWidth: 500 }}>
      <EnvironmentVariablesHeader>
        <EnvironmentVariablesTitle>API Keys</EnvironmentVariablesTitle>
        <EnvironmentVariablesToggle />
      </EnvironmentVariablesHeader>
      <EnvironmentVariablesContent>
        <EnvironmentVariable name="ANTHROPIC_API_KEY" value="sk-ant-api03-xxxxxxxx">
          <EnvironmentVariableGroup>
            <EnvironmentVariableName />
            <EnvironmentVariableRequired>Required</EnvironmentVariableRequired>
          </EnvironmentVariableGroup>
          <EnvironmentVariableGroup>
            <EnvironmentVariableValue />
            <EnvironmentVariableCopyButton onCopy={fn()} />
          </EnvironmentVariableGroup>
        </EnvironmentVariable>
      </EnvironmentVariablesContent>
    </EnvironmentVariables>
  ),
}

export const SimpleList: Story = {
  render: () => (
    <EnvironmentVariables style={{ maxWidth: 480 }}>
      <EnvironmentVariablesHeader>
        <EnvironmentVariablesTitle />
      </EnvironmentVariablesHeader>
      <EnvironmentVariablesContent>
        {[
          { name: 'NODE_ENV', value: 'production' },
          { name: 'PORT', value: '3000' },
          { name: 'LOG_LEVEL', value: 'info' },
        ].map(({ name, value }) => (
          <EnvironmentVariable key={name} name={name} value={value} />
        ))}
      </EnvironmentVariablesContent>
    </EnvironmentVariables>
  ),
}
