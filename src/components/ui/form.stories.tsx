import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { useForm } from 'react-hook-form'

import { Button } from './button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './form'
import { Input } from './input'

const meta: Meta = {
  title: 'UI/Form',
  component: Form,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof meta>

// ── Helpers ───────────────────────────────────────────────────────────────────

function BasicForm({ onSubmit = fn() }: { onSubmit?: (values: { username: string }) => void }) {
  const form = useForm<{ username: string }>({
    defaultValues: { username: '' },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-80 space-y-6">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="johndoe" {...field} />
              </FormControl>
              <FormDescription>This is your public display name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  )
}

function ValidationErrorForm() {
  const form = useForm<{ email: string }>({
    defaultValues: { email: '' },
    mode: 'onChange',
  })

  // Trigger a validation error immediately for display purposes.
  form.setError('email', {
    type: 'manual',
    message: 'A valid email address is required.',
  })

  return (
    <Form {...form}>
      <form className="w-80 space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@example.com" {...field} />
              </FormControl>
              <FormDescription>We will never share your email.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Subscribe</Button>
      </form>
    </Form>
  )
}

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default: Story = {
  render: () => <BasicForm />,
}

export const WithValidationError: Story = {
  name: 'With Validation Error',
  render: () => <ValidationErrorForm />,
}
