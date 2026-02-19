// server/lib/agents/theme-metadata.ts
export type DesignType = 'website' | 'admin' | 'hybrid'

export interface ThemeMetadata {
  name: string
  description: string
  designType: DesignType
  useCases: string[]
  baseTables: string[]
  notSuitableFor: string[]
}

export function getThemeMetadata(): ThemeMetadata[] {
  return [
    {
      name: 'canape',
      description: 'Restaurant website with menu, blog, reservations, testimonials',
      designType: 'website',
      useCases: ['restaurant-website', 'cafe-website', 'bakery-website'],
      baseTables: [
        'entities',
        'menu_items',
        'posts',
        'comments',
        'testimonials',
        'services_page',
        'pages',
        'site_settings',
        'reservations',
      ],
      notSuitableFor: ['staff-management', 'internal-operations', 'admin-dashboard'],
    },
    {
      name: 'quomi',
      description: 'Portfolio/gallery with masonry layout, projects, case studies',
      designType: 'website',
      useCases: ['portfolio', 'photography', 'agency', 'gallery'],
      baseTables: ['projects', 'case_studies', 'testimonials', 'team_members'],
      notSuitableFor: ['staff-management', 'internal-operations'],
    },
    {
      name: 'dashboard',
      description: 'Admin dashboard with sidebar, data tables, analytics',
      designType: 'admin',
      useCases: ['management-system', 'admin-panel', 'internal-operations', 'staff-app'],
      baseTables: ['users', 'roles', 'audit_logs'],
      notSuitableFor: ['public-website', 'portfolio'],
    },
    {
      name: 'corporate',
      description: 'Corporate website with hero, features, CTAs',
      designType: 'website',
      useCases: ['saas-landing', 'corporate-site', 'service-website'],
      baseTables: ['pages', 'testimonials', 'team_members'],
      notSuitableFor: ['staff-management'],
    },
    {
      name: 'gallery',
      description: 'Image-first masonry gallery with minimal chrome',
      designType: 'website',
      useCases: ['photography-portfolio', 'art-gallery', 'image-showcase'],
      baseTables: ['projects', 'images', 'collections'],
      notSuitableFor: ['staff-management', 'data-heavy-apps'],
    },
  ]
}

export function findThemeByName(name: string): ThemeMetadata | undefined {
  return getThemeMetadata().find(t => t.name === name)
}

export function isThemeSuitableFor(themeName: string, intent: string): boolean {
  const theme = findThemeByName(themeName)
  if (!theme) return false
  return !theme.notSuitableFor.includes(intent)
}
