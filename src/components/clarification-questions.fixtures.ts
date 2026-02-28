import type { ClarificationQuestion } from '@/lib/types'

export const singleQuestion: ClarificationQuestion[] = [
  {
    question: 'What type of authentication does your app need?',
    selectionMode: 'single',
    options: [
      { label: 'Email & Password', description: 'Classic username/password login flow' },
      { label: 'Social OAuth', description: 'Google, GitHub, or similar provider' },
      { label: 'Magic Link', description: 'Passwordless — user clicks an emailed link' },
      { label: 'No Auth', description: 'Fully public app, no sign-in required' },
    ],
  },
]

export const multipleChoiceQuestion: ClarificationQuestion[] = [
  {
    question: 'Which features should the app include?',
    selectionMode: 'multiple',
    options: [
      { label: 'User Dashboard', description: 'Personal workspace with key metrics' },
      { label: 'Admin Panel', description: 'Manage users, content, and settings' },
      { label: 'Notifications', description: 'In-app and email notifications' },
      { label: 'File Uploads', description: 'Attach images or documents' },
    ],
  },
]

export const multipleQuestions: ClarificationQuestion[] = [
  {
    question: 'What type of authentication does your app need?',
    selectionMode: 'single',
    options: [
      { label: 'Email & Password', description: 'Classic username/password login flow' },
      { label: 'Social OAuth', description: 'Google, GitHub, or similar provider' },
      { label: 'Magic Link', description: 'Passwordless — user clicks an emailed link' },
      { label: 'No Auth', description: 'Fully public app, no sign-in required' },
    ],
  },
  {
    question: 'Which features should the app include?',
    selectionMode: 'multiple',
    options: [
      { label: 'User Dashboard', description: 'Personal workspace with key metrics' },
      { label: 'Admin Panel', description: 'Manage users, content, and settings' },
      { label: 'Notifications', description: 'In-app and email notifications' },
      { label: 'File Uploads', description: 'Attach images or documents' },
    ],
  },
  {
    question: 'What visual style should the UI follow?',
    selectionMode: 'single',
    options: [
      { label: 'Minimal', description: 'Clean, whitespace-heavy, typography-first' },
      { label: 'Bold', description: 'High contrast, large elements, expressive colors' },
      { label: 'Corporate', description: 'Professional and structured, table-heavy' },
      { label: 'Playful', description: 'Rounded corners, illustrations, vibrant palette' },
    ],
  },
]
