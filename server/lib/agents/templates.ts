import type { DesignAgentTokens, TemplateCategory, TemplatePreset } from '../types'

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'saas-minimal',
    name: 'Minimal SaaS',
    category: 'saas',
    description: 'Clean, minimal SaaS landing page with pricing and feature sections',
    screenshotUrl: '/templates/saas-minimal.png',
    repoPath: 'saas-minimal',
    tokens: {
      colors: {
        primary: 'oklch(0.55 0.15 250)',
        secondary: 'oklch(0.65 0.10 280)',
        accent: 'oklch(0.70 0.20 160)',
        background: 'oklch(0.99 0 0)',
        foreground: 'oklch(0.15 0 0)',
        muted: 'oklch(0.95 0.01 250)',
        card: 'oklch(0.98 0 0)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Inter',
        body: 'Inter',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      style: {
        borderRadius: '0.5rem',
        cardStyle: 'flat',
        navStyle: 'fixed-top',
        heroLayout: 'centered',
        spacing: 'comfortable',
        motion: 'subtle',
        imagery: 'illustrations',
        sections: [
          { id: 'navbar', label: 'Navigation Bar' },
          { id: 'hero', label: 'Hero Section' },
          { id: 'features', label: 'Features Grid' },
          { id: 'pricing', label: 'Pricing Cards' },
          { id: 'testimonials', label: 'Testimonials' },
          { id: 'faq', label: 'FAQ' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'standard',
      },
    },
  },
  {
    id: 'saas-bold',
    name: 'Bold SaaS',
    category: 'saas',
    description: 'Bold, high-contrast SaaS app with gradient accents and large typography',
    screenshotUrl: '/templates/saas-bold.png',
    repoPath: 'saas-bold',
    tokens: {
      colors: {
        primary: 'oklch(0.65 0.25 270)',
        secondary: 'oklch(0.50 0.20 300)',
        accent: 'oklch(0.75 0.20 150)',
        background: 'oklch(0.13 0.02 270)',
        foreground: 'oklch(0.95 0 0)',
        muted: 'oklch(0.20 0.02 270)',
        card: 'oklch(0.18 0.03 270)',
        destructive: 'oklch(0.60 0.25 25)',
      },
      fonts: {
        display: 'Space Grotesk',
        body: 'Inter',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap',
      },
      style: {
        borderRadius: '0.75rem',
        cardStyle: 'glass',
        navStyle: 'fixed-top',
        heroLayout: 'split',
        spacing: 'spacious',
        motion: 'expressive',
        imagery: 'gradients',
        sections: [
          { id: 'navbar', label: 'Navigation Bar' },
          { id: 'hero', label: 'Hero Section' },
          { id: 'features', label: 'Features Showcase' },
          { id: 'how-it-works', label: 'How It Works' },
          { id: 'pricing', label: 'Pricing' },
          { id: 'cta', label: 'Call to Action' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'wide',
      },
    },
  },
  {
    id: 'portfolio-creative',
    name: 'Creative Portfolio',
    category: 'portfolio',
    description: 'Artist/designer portfolio with masonry grid and project showcases',
    screenshotUrl: '/templates/portfolio-creative.png',
    repoPath: 'portfolio-creative',
    tokens: {
      colors: {
        primary: 'oklch(0.70 0.15 50)',
        secondary: 'oklch(0.60 0.12 30)',
        accent: 'oklch(0.80 0.18 80)',
        background: 'oklch(0.98 0.01 80)',
        foreground: 'oklch(0.20 0.02 50)',
        muted: 'oklch(0.93 0.02 80)',
        card: 'oklch(0.97 0.01 80)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Playfair Display',
        body: 'Source Sans 3',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Source+Sans+3:wght@400;600&display=swap',
      },
      style: {
        borderRadius: '0.25rem',
        cardStyle: 'elevated',
        navStyle: 'minimal',
        heroLayout: 'full-bleed',
        spacing: 'spacious',
        motion: 'expressive',
        imagery: 'photography',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Hero' },
          { id: 'portfolio', label: 'Project Grid' },
          { id: 'about', label: 'About Me' },
          { id: 'contact', label: 'Contact' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'wide',
      },
    },
  },
  {
    id: 'portfolio-developer',
    name: 'Developer Portfolio',
    category: 'portfolio',
    description: 'Developer portfolio with terminal aesthetics and project cards',
    screenshotUrl: '/templates/portfolio-developer.png',
    repoPath: 'portfolio-developer',
    tokens: {
      colors: {
        primary: 'oklch(0.70 0.20 160)',
        secondary: 'oklch(0.60 0.15 200)',
        accent: 'oklch(0.75 0.15 60)',
        background: 'oklch(0.15 0.02 250)',
        foreground: 'oklch(0.90 0.02 160)',
        muted: 'oklch(0.22 0.02 250)',
        card: 'oklch(0.19 0.02 250)',
        destructive: 'oklch(0.60 0.22 25)',
      },
      fonts: {
        display: 'JetBrains Mono',
        body: 'Inter',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Inter:wght@400;500&display=swap',
      },
      style: {
        borderRadius: '0.5rem',
        cardStyle: 'bordered',
        navStyle: 'fixed-top',
        heroLayout: 'centered',
        spacing: 'comfortable',
        motion: 'subtle',
        imagery: 'code-blocks',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Hero' },
          { id: 'projects', label: 'Projects' },
          { id: 'skills', label: 'Skills' },
          { id: 'experience', label: 'Experience' },
          { id: 'contact', label: 'Contact' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'standard',
      },
    },
  },
  {
    id: 'ecommerce-modern',
    name: 'Modern Shop',
    category: 'ecommerce',
    description: 'E-commerce storefront with product grid, cart, and checkout flow',
    screenshotUrl: '/templates/ecommerce-modern.png',
    repoPath: 'ecommerce-modern',
    tokens: {
      colors: {
        primary: 'oklch(0.45 0.10 250)',
        secondary: 'oklch(0.55 0.08 280)',
        accent: 'oklch(0.70 0.18 80)',
        background: 'oklch(0.99 0 0)',
        foreground: 'oklch(0.15 0 0)',
        muted: 'oklch(0.96 0.01 250)',
        card: 'oklch(0.99 0 0)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'DM Sans',
        body: 'DM Sans',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap',
      },
      style: {
        borderRadius: '0.75rem',
        cardStyle: 'elevated',
        navStyle: 'fixed-top',
        heroLayout: 'split',
        spacing: 'comfortable',
        motion: 'subtle',
        imagery: 'photography',
        sections: [
          { id: 'navbar', label: 'Navigation + Cart' },
          { id: 'hero', label: 'Hero Banner' },
          { id: 'featured', label: 'Featured Products' },
          { id: 'categories', label: 'Categories' },
          { id: 'deals', label: 'Deals Section' },
          { id: 'newsletter', label: 'Newsletter' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'wide',
      },
    },
  },
  {
    id: 'ecommerce-boutique',
    name: 'Boutique Store',
    category: 'ecommerce',
    description: 'Luxury boutique with editorial layouts and refined typography',
    screenshotUrl: '/templates/ecommerce-boutique.png',
    repoPath: 'ecommerce-boutique',
    tokens: {
      colors: {
        primary: 'oklch(0.35 0.05 50)',
        secondary: 'oklch(0.55 0.08 40)',
        accent: 'oklch(0.65 0.12 50)',
        background: 'oklch(0.97 0.01 80)',
        foreground: 'oklch(0.20 0.02 50)',
        muted: 'oklch(0.93 0.02 80)',
        card: 'oklch(0.98 0.01 80)',
        destructive: 'oklch(0.55 0.18 25)',
      },
      fonts: {
        display: 'Cormorant Garamond',
        body: 'Lato',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Lato:wght@400;700&display=swap',
      },
      style: {
        borderRadius: '0rem',
        cardStyle: 'flat',
        navStyle: 'minimal',
        heroLayout: 'full-bleed',
        spacing: 'spacious',
        motion: 'elegant',
        imagery: 'photography',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Hero' },
          { id: 'collection', label: 'Collections' },
          { id: 'featured', label: 'Featured Products' },
          { id: 'story', label: 'Brand Story' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'standard',
      },
    },
  },
  {
    id: 'blog-editorial',
    name: 'Editorial Blog',
    category: 'blog',
    description: 'Clean editorial blog with magazine-style layouts and reading focus',
    screenshotUrl: '/templates/blog-editorial.png',
    repoPath: 'blog-editorial',
    tokens: {
      colors: {
        primary: 'oklch(0.45 0.12 250)',
        secondary: 'oklch(0.55 0.10 280)',
        accent: 'oklch(0.65 0.15 30)',
        background: 'oklch(0.99 0 0)',
        foreground: 'oklch(0.20 0 0)',
        muted: 'oklch(0.96 0.01 250)',
        card: 'oklch(0.99 0 0)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Merriweather',
        body: 'Source Sans 3',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Merriweather:wght@700;900&family=Source+Sans+3:wght@400;600&display=swap',
      },
      style: {
        borderRadius: '0.25rem',
        cardStyle: 'flat',
        navStyle: 'fixed-top',
        heroLayout: 'centered',
        spacing: 'spacious',
        motion: 'minimal',
        imagery: 'photography',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Featured Article' },
          { id: 'latest', label: 'Latest Posts' },
          { id: 'categories', label: 'Categories' },
          { id: 'newsletter', label: 'Newsletter Signup' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'narrow',
      },
    },
  },
  {
    id: 'blog-personal',
    name: 'Personal Blog',
    category: 'blog',
    description: 'Warm personal blog with sidebar and social links',
    screenshotUrl: '/templates/blog-personal.png',
    repoPath: 'blog-personal',
    tokens: {
      colors: {
        primary: 'oklch(0.55 0.15 150)',
        secondary: 'oklch(0.65 0.12 180)',
        accent: 'oklch(0.70 0.18 60)',
        background: 'oklch(0.98 0.01 100)',
        foreground: 'oklch(0.20 0.02 100)',
        muted: 'oklch(0.94 0.02 100)',
        card: 'oklch(0.97 0.01 100)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Nunito',
        body: 'Nunito',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
      },
      style: {
        borderRadius: '1rem',
        cardStyle: 'elevated',
        navStyle: 'fixed-top',
        heroLayout: 'centered',
        spacing: 'comfortable',
        motion: 'subtle',
        imagery: 'illustrations',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Welcome' },
          { id: 'posts', label: 'Recent Posts' },
          { id: 'about', label: 'About Me' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'narrow',
      },
    },
  },
  {
    id: 'dashboard-analytics',
    name: 'Analytics Dashboard',
    category: 'dashboard',
    description: 'Data-rich analytics dashboard with charts, tables, and KPI cards',
    screenshotUrl: '/templates/dashboard-analytics.png',
    repoPath: 'dashboard-analytics',
    tokens: {
      colors: {
        primary: 'oklch(0.60 0.18 250)',
        secondary: 'oklch(0.50 0.12 280)',
        accent: 'oklch(0.70 0.20 160)',
        background: 'oklch(0.16 0.02 250)',
        foreground: 'oklch(0.92 0 0)',
        muted: 'oklch(0.22 0.02 250)',
        card: 'oklch(0.20 0.02 250)',
        destructive: 'oklch(0.60 0.22 25)',
      },
      fonts: {
        display: 'Inter',
        body: 'Inter',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      style: {
        borderRadius: '0.75rem',
        cardStyle: 'bordered',
        navStyle: 'sidebar',
        heroLayout: 'dashboard',
        spacing: 'compact',
        motion: 'subtle',
        imagery: 'data-viz',
        sections: [
          { id: 'sidebar', label: 'Sidebar Navigation' },
          { id: 'topbar', label: 'Top Bar' },
          { id: 'kpi', label: 'KPI Cards' },
          { id: 'charts', label: 'Charts Grid' },
          { id: 'table', label: 'Data Table' },
        ],
        contentWidth: 'wide',
      },
    },
  },
  {
    id: 'dashboard-admin',
    name: 'Admin Panel',
    category: 'dashboard',
    description: 'Full admin panel with sidebar nav, user management, and settings',
    screenshotUrl: '/templates/dashboard-admin.png',
    repoPath: 'dashboard-admin',
    tokens: {
      colors: {
        primary: 'oklch(0.55 0.15 250)',
        secondary: 'oklch(0.65 0.10 280)',
        accent: 'oklch(0.70 0.15 160)',
        background: 'oklch(0.98 0 0)',
        foreground: 'oklch(0.15 0 0)',
        muted: 'oklch(0.95 0.01 250)',
        card: 'oklch(0.99 0 0)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Inter',
        body: 'Inter',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      style: {
        borderRadius: '0.5rem',
        cardStyle: 'bordered',
        navStyle: 'sidebar',
        heroLayout: 'dashboard',
        spacing: 'compact',
        motion: 'minimal',
        imagery: 'icons',
        sections: [
          { id: 'sidebar', label: 'Sidebar' },
          { id: 'topbar', label: 'Top Bar' },
          { id: 'stats', label: 'Stats Cards' },
          { id: 'content', label: 'Content Area' },
        ],
        contentWidth: 'wide',
      },
    },
  },
  {
    id: 'landing-startup',
    name: 'Startup Landing',
    category: 'landing',
    description: 'High-converting startup landing page with social proof and CTA focus',
    screenshotUrl: '/templates/landing-startup.png',
    repoPath: 'landing-startup',
    tokens: {
      colors: {
        primary: 'oklch(0.60 0.22 270)',
        secondary: 'oklch(0.50 0.18 300)',
        accent: 'oklch(0.75 0.18 160)',
        background: 'oklch(0.99 0 0)',
        foreground: 'oklch(0.15 0 0)',
        muted: 'oklch(0.96 0.01 270)',
        card: 'oklch(0.98 0 0)',
        destructive: 'oklch(0.55 0.22 25)',
      },
      fonts: {
        display: 'Plus Jakarta Sans',
        body: 'Inter',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500&display=swap',
      },
      style: {
        borderRadius: '0.75rem',
        cardStyle: 'elevated',
        navStyle: 'fixed-top',
        heroLayout: 'centered',
        spacing: 'spacious',
        motion: 'expressive',
        imagery: 'mixed',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Hero + CTA' },
          { id: 'logos', label: 'Logo Cloud' },
          { id: 'features', label: 'Features' },
          { id: 'how-it-works', label: 'How It Works' },
          { id: 'testimonials', label: 'Testimonials' },
          { id: 'pricing', label: 'Pricing' },
          { id: 'cta', label: 'Final CTA' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'standard',
      },
    },
  },
  {
    id: 'landing-product',
    name: 'Product Launch',
    category: 'landing',
    description: 'Product launch page with feature tours and comparison tables',
    screenshotUrl: '/templates/landing-product.png',
    repoPath: 'landing-product',
    tokens: {
      colors: {
        primary: 'oklch(0.55 0.18 220)',
        secondary: 'oklch(0.65 0.14 200)',
        accent: 'oklch(0.70 0.20 50)',
        background: 'oklch(0.99 0 0)',
        foreground: 'oklch(0.15 0 0)',
        muted: 'oklch(0.96 0.01 220)',
        card: 'oklch(0.98 0 0)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Outfit',
        body: 'Inter',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Inter:wght@400;500&display=swap',
      },
      style: {
        borderRadius: '0.5rem',
        cardStyle: 'flat',
        navStyle: 'fixed-top',
        heroLayout: 'split',
        spacing: 'comfortable',
        motion: 'subtle',
        imagery: 'screenshots',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Hero + Product Shot' },
          { id: 'features', label: 'Feature Tour' },
          { id: 'comparison', label: 'Comparison' },
          { id: 'testimonials', label: 'Testimonials' },
          { id: 'cta', label: 'CTA' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'standard',
      },
    },
  },
]

/**
 * Rank templates by similarity to generated tokens.
 * Simple heuristic: category match > style matches.
 */
export function rankTemplates(
  tokens: DesignAgentTokens,
  category?: TemplateCategory,
): TemplatePreset[] {
  return [...TEMPLATE_PRESETS]
    .sort((a, b) => {
      let scoreA = 0
      let scoreB = 0
      if (category && a.category === category) scoreA += 10
      if (category && b.category === category) scoreB += 10
      if (a.tokens.style.navStyle === tokens.style.navStyle) scoreA += 2
      if (b.tokens.style.navStyle === tokens.style.navStyle) scoreB += 2
      if (a.tokens.style.heroLayout === tokens.style.heroLayout) scoreA += 2
      if (b.tokens.style.heroLayout === tokens.style.heroLayout) scoreB += 2
      if (a.tokens.style.cardStyle === tokens.style.cardStyle) scoreA += 1
      if (b.tokens.style.cardStyle === tokens.style.cardStyle) scoreB += 1
      if (a.tokens.style.contentWidth === tokens.style.contentWidth) scoreA += 1
      if (b.tokens.style.contentWidth === tokens.style.contentWidth) scoreB += 1
      return scoreB - scoreA
    })
    .slice(0, 3)
}
