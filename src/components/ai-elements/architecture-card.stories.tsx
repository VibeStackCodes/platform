import type { Meta, StoryObj } from '@storybook/react'
import { ArchitectureCard } from './architecture-card'

const meta = {
  title: 'AI/ArchitectureCard',
  component: ArchitectureCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ArchitectureCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    spec: {
      archetype: 'saas-app',
      auth: { required: true },
      sitemap: [
        {
          route: '/',
          componentName: 'LandingPage',
          purpose: 'Marketing landing page',
          sections: ['Hero', 'Features', 'Pricing', 'Footer'],
          dataRequirements: 'Static content',
        },
        {
          route: '/dashboard',
          componentName: 'Dashboard',
          purpose: 'Main authenticated view',
          sections: ['Sidebar', 'MetricsGrid', 'RecentActivity'],
          dataRequirements: 'User data, metrics API',
        },
        {
          route: '/settings',
          componentName: 'Settings',
          purpose: 'User preferences',
          sections: ['Profile', 'Billing', 'Notifications'],
          dataRequirements: 'User profile, subscription',
        },
      ],
    },
  },
}

export const SinglePage: Story = {
  args: {
    spec: {
      archetype: 'landing-page',
      auth: { required: false },
      sitemap: [
        {
          route: '/',
          componentName: 'Home',
          purpose: 'Single page marketing site',
          sections: ['Hero', 'About', 'Contact'],
          dataRequirements: 'None',
        },
      ],
    },
  },
}

export const ComplexApp: Story = {
  args: {
    spec: {
      archetype: 'marketplace',
      auth: { required: true },
      sitemap: [
        {
          route: '/',
          componentName: 'Home',
          purpose: 'Home feed',
          sections: ['SearchBar', 'FeaturedListings', 'Categories'],
          dataRequirements: 'Listing feed, categories',
        },
        {
          route: '/listings',
          componentName: 'Listings',
          purpose: 'Browse listings',
          sections: ['Filters', 'ListingGrid', 'Pagination'],
          dataRequirements: 'Filtered listings API',
        },
        {
          route: '/listings/:id',
          componentName: 'ListingDetail',
          purpose: 'View single listing',
          sections: ['Gallery', 'Details', 'ContactForm', 'RelatedListings'],
          dataRequirements: 'Listing by ID',
        },
        {
          route: '/profile',
          componentName: 'Profile',
          purpose: 'User profile',
          sections: ['Avatar', 'Bio', 'MyListings'],
          dataRequirements: 'User profile, own listings',
        },
        {
          route: '/messages',
          componentName: 'Messages',
          purpose: 'Messaging inbox',
          sections: ['ThreadList', 'MessageView', 'Composer'],
          dataRequirements: 'Message threads, real-time',
        },
      ],
    },
  },
}
