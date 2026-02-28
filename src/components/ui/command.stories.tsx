import type { Meta, StoryObj } from '@storybook/react'
import {
  CalendarIcon,
  CreditCardIcon,
  FileIcon,
  FolderIcon,
  SettingsIcon,
  SmileIcon,
  UserIcon,
} from 'lucide-react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

const meta = {
  title: 'UI/Command',
  component: Command,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Command>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md w-[350px]">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <CalendarIcon />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <SmileIcon />
            <span>Search Emoji</span>
          </CommandItem>
          <CommandItem>
            <CreditCardIcon />
            <span>Billing</span>
            <CommandShortcut>B</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>
            <UserIcon />
            <span>Profile</span>
            <CommandShortcut>P</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <CreditCardIcon />
            <span>Billing</span>
            <CommandShortcut>B</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <SettingsIcon />
            <span>Settings</span>
            <CommandShortcut>S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}

export const EmptyState: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md w-[350px]">
      <CommandInput placeholder="Search components..." defaultValue="xyznotfound" />
      <CommandList>
        <CommandEmpty>No components found. Try a different search term.</CommandEmpty>
        <CommandGroup heading="Components">
          <CommandItem>
            <FileIcon />
            Button
          </CommandItem>
          <CommandItem>
            <FileIcon />
            Input
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}

export const FileExplorer: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md w-[400px]">
      <CommandInput placeholder="Search files..." />
      <CommandList>
        <CommandEmpty>No files found.</CommandEmpty>
        <CommandGroup heading="Recent Files">
          <CommandItem>
            <FileIcon />
            <span>index.tsx</span>
            <CommandShortcut>src/</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <FileIcon />
            <span>button.tsx</span>
            <CommandShortcut>components/ui/</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <FileIcon />
            <span>utils.ts</span>
            <CommandShortcut>lib/</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Folders">
          <CommandItem>
            <FolderIcon />
            <span>components</span>
          </CommandItem>
          <CommandItem>
            <FolderIcon />
            <span>lib</span>
          </CommandItem>
          <CommandItem>
            <FolderIcon />
            <span>hooks</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}

export const WithMultipleGroups: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md w-[350px]">
      <CommandInput placeholder="Search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem>Dashboard</CommandItem>
          <CommandItem>Projects</CommandItem>
          <CommandItem>Settings</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem>
            <span>New Project</span>
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <span>Import</span>
            <CommandShortcut>I</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem>
            <UserIcon />
            Profile
          </CommandItem>
          <CommandItem>
            <SettingsIcon />
            Preferences
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}
