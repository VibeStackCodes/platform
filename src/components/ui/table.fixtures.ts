export type Invoice = {
  id: string
  invoice: string
  paymentStatus: 'Paid' | 'Pending' | 'Unpaid'
  totalAmount: string
  paymentMethod: 'Credit Card' | 'PayPal' | 'Bank Transfer'
}

export const invoices: Invoice[] = [
  {
    id: '1',
    invoice: 'INV-001',
    paymentStatus: 'Paid',
    totalAmount: '$250.00',
    paymentMethod: 'Credit Card',
  },
  {
    id: '2',
    invoice: 'INV-002',
    paymentStatus: 'Pending',
    totalAmount: '$150.00',
    paymentMethod: 'PayPal',
  },
  {
    id: '3',
    invoice: 'INV-003',
    paymentStatus: 'Unpaid',
    totalAmount: '$350.00',
    paymentMethod: 'Bank Transfer',
  },
  {
    id: '4',
    invoice: 'INV-004',
    paymentStatus: 'Paid',
    totalAmount: '$450.00',
    paymentMethod: 'Credit Card',
  },
  {
    id: '5',
    invoice: 'INV-005',
    paymentStatus: 'Paid',
    totalAmount: '$550.00',
    paymentMethod: 'PayPal',
  },
]

export const invoiceStatusColors: Record<Invoice['paymentStatus'], string> = {
  Paid: 'text-green-600 dark:text-green-400',
  Pending: 'text-yellow-600 dark:text-yellow-400',
  Unpaid: 'text-red-600 dark:text-red-400',
}
