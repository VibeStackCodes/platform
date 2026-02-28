import type { Meta, StoryObj } from '@storybook/react'

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { invoices, invoiceStatusColors } from './table.fixtures'

const meta = {
  title: 'UI/Table',
  component: Table,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Table>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>A list of recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="font-medium">{invoice.invoice}</TableCell>
            <TableCell>
              <span className={invoiceStatusColors[invoice.paymentStatus]}>
                {invoice.paymentStatus}
              </span>
            </TableCell>
            <TableCell>{invoice.paymentMethod}</TableCell>
            <TableCell className="text-right">{invoice.totalAmount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right">$1,750.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
}

export const WithoutFooter: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="font-medium">{invoice.invoice}</TableCell>
            <TableCell>{invoice.paymentStatus}</TableCell>
            <TableCell>{invoice.paymentMethod}</TableCell>
            <TableCell className="text-right">{invoice.totalAmount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
}

export const Dense: Story = {
  render: () => (
    <div className="w-[500px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[
            { name: 'Alice Martin', email: 'alice@example.com', role: 'Admin', status: 'Active' },
            { name: 'Bob Chen', email: 'bob@example.com', role: 'Editor', status: 'Active' },
            { name: 'Carol Davis', email: 'carol@example.com', role: 'Viewer', status: 'Inactive' },
            { name: 'David Kim', email: 'david@example.com', role: 'Editor', status: 'Active' },
            { name: 'Eve Johnson', email: 'eve@example.com', role: 'Viewer', status: 'Pending' },
          ].map((user) => (
            <TableRow key={user.email}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell>{user.role}</TableCell>
              <TableCell>
                <span
                  className={
                    user.status === 'Active'
                      ? 'text-green-600'
                      : user.status === 'Pending'
                        ? 'text-yellow-600'
                        : 'text-muted-foreground'
                  }
                >
                  {user.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
}
