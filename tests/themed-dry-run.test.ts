/**
 * Themed Dry-Run Pipeline Integration Test
 *
 * Exercises the unified section composition pipeline (all themes):
 *   SchemaContract + ThemeTokens → generateThemedApp() → all themed files
 *   → write to tmpdir → tsc --noEmit
 *
 * Tests 4 scenarios:
 *   1. Restaurant Menu (public, editorial nav, food colors, FKs)
 *   2. SaaS Dashboard (private, sidebar nav, business colors, multi-entity)
 *   3. Blog Platform (hybrid, minimal nav, typography-focused)
 *   4. Canape theme (domain-specific routes via section composition)
 *
 * Each verifies:
 *   - Themed files generated (homepage, about, contact, entity list/detail)
 *   - Auth posture routes correct (public vs private vs hybrid)
 *   - Generated TypeScript compiles (tsc --noEmit)
 *
 * NOTE: There is no longer a two-track system. ALL themes (including Canape)
 * go through fallbackCompositionPlan() → assemblePages(). The old Canape-
 * specific hand-crafted route generators have been removed.
 */

import { describe, it, expect } from 'vitest'
import { generateThemedApp, type ThemeTokens } from '@server/lib/themed-code-engine'
import { deriveArchetype } from '@server/lib/theme-layouts'
import { contractToBlueprint } from '@server/lib/app-blueprint'
import { checkScaffold } from '@server/lib/agents/validation'
import type { SchemaContract } from '@server/lib/schema-contract'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Write blueprint files to a temp directory and run tsc --noEmit.
 * Returns pass/fail + error output.
 */
function typeCheckBlueprint(
  testName: string,
  blueprint: ReturnType<typeof contractToBlueprint>,
) {
  const tmpDir = join('/tmp', `vibestack-themed-${testName}-${Date.now()}`)

  try {
    // Write all files from the blueprint fileTree
    for (const file of blueprint.fileTree) {
      const filePath = join(tmpDir, file.path)
      mkdirSync(join(filePath, '..'), { recursive: true })
      writeFileSync(filePath, file.content)
    }

    // Write tsconfig.json for the generated app
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        baseUrl: '.',
        paths: { '@/*': ['./src/*'] },
        types: ['vite/client'],
      },
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['node_modules'],
    }
    writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))

    // Symlink node_modules from the project root for type resolution
    const worktreeRoot = join(import.meta.dirname, '..')
    try {
      execFileSync('ln', ['-sf', join(worktreeRoot, 'node_modules'), join(tmpDir, 'node_modules')])
    } catch {
      // ignore if symlink exists
    }

    // Run tsc --noEmit
    let tscOutput = ''
    try {
      tscOutput = execFileSync(
        'npx',
        ['tsc', '--noEmit', '--pretty', 'false'],
        { encoding: 'utf-8', timeout: 30000, cwd: tmpDir },
      )
    } catch (error: any) {
      tscOutput = (error.stdout ?? '') + (error.stderr ?? '')
    }

    // Filter out route-tree-dependent errors (same as existing dry-run tests)
    const errors = tscOutput.split('\n').filter((line) => {
      if (!line.includes('error TS')) return false
      if (line.includes("is not assignable to parameter of type 'undefined'")) return false
      if (line.includes("Property 'search' is missing")) return false
      if (/is not assignable to type '"\."/.test(line)) return false
      if (/Type '"\/[^"]*"' is not assignable/.test(line)) return false
      return true
    })

    return { tmpDir, tscOutput: errors.join('\n').trim(), passed: errors.length === 0 }
  } catch (error) {
    return {
      tmpDir,
      tscOutput: error instanceof Error ? error.message : String(error),
      passed: false,
    }
  }
}

// ============================================================================
// Test 1: Restaurant Menu (public auth, editorial, food theme)
// ============================================================================

const restaurantContract: SchemaContract = {
  tables: [
    {
      name: 'menu_category',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
        { name: 'description', type: 'text' },
        { name: 'sort_order', type: 'integer', nullable: false, default: '0' },
      ],
    },
    {
      name: 'dish',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
        { name: 'description', type: 'text' },
        { name: 'price', type: 'numeric', nullable: false },
        { name: 'image_url', type: 'text' },
        { name: 'is_available', type: 'boolean', nullable: false, default: 'true' },
        { name: 'category_id', type: 'uuid', nullable: false, references: { table: 'menu_category', column: 'id' } },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
  ],
}

const gourmettroTokens: ThemeTokens = {
  name: 'theme-gourmetto',
  fonts: {
    display: 'Playfair Display',
    body: 'Inter',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap',
  },
  colors: {
    background: '#fff8f1',
    foreground: '#2b1b12',
    primary: '#9a3412',
    primaryForeground: '#fff8f1',
    secondary: '#f4c98b',
    accent: '#d97706',
    muted: '#fdebd4',
    border: '#edc7a3',
  },
  style: {
    borderRadius: '0.5rem',
    cardStyle: 'flat',
    navStyle: 'editorial',
    heroLayout: 'editorial',
    spacing: 'normal',
    motion: 'subtle',
    imagery: 'photography-heavy',
  },
  authPosture: 'public',
  heroImages: [],
  heroQuery: 'gourmet food restaurant dining',
  textSlots: {
    hero_headline: 'Savor Every Moment',
    hero_subtext: 'Discover our curated menu of artisan dishes and seasonal favorites.',
    about_paragraph: 'We bring together the finest ingredients and culinary traditions. Our menu celebrates local produce and timeless recipes.',
    cta_label: 'View menu',
    empty_state: 'No dishes yet. Add your first creation to the menu.',
    footer_tagline: 'Crafted with passion.',
  },
}

// ============================================================================
// Test 2: SaaS Dashboard (private auth, sidebar, business theme)
// ============================================================================

const saasContract: SchemaContract = {
  tables: [
    {
      name: 'client',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
        { name: 'email', type: 'text', nullable: false },
        { name: 'company', type: 'text' },
        { name: 'status', type: 'text', nullable: false, default: "'active'" },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
    {
      name: 'invoice',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'client_id', type: 'uuid', nullable: false, references: { table: 'client', column: 'id' } },
        { name: 'amount', type: 'numeric', nullable: false },
        { name: 'status', type: 'text', nullable: false, default: "'pending'" },
        { name: 'due_date', type: 'date', nullable: false },
        { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
    {
      name: 'payment',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'invoice_id', type: 'uuid', nullable: false, references: { table: 'invoice', column: 'id' } },
        { name: 'amount', type: 'numeric', nullable: false },
        { name: 'method', type: 'text', nullable: false },
        { name: 'paid_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
  ],
}

const luxusTokens: ThemeTokens = {
  name: 'theme-luxus',
  fonts: {
    display: 'Playfair Display',
    body: 'Inter',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap',
  },
  colors: {
    background: '#ebf4f2',
    foreground: '#057067',
    primary: '#057067',
    primaryForeground: '#ebf4f2',
    secondary: '#dbeafe',
    accent: '#e5e7eb',
    muted: '#eff6ff',
    border: '#cbd5e1',
  },
  style: {
    borderRadius: '0.5rem',
    cardStyle: 'glass',
    navStyle: 'sidebar',
    heroLayout: 'split',
    spacing: 'compact',
    motion: 'subtle',
    imagery: 'icon-focused',
  },
  authPosture: 'private',
  heroImages: [],
  heroQuery: 'business analytics dashboard',
  textSlots: {
    hero_headline: 'Manage Your Clients with Clarity',
    hero_subtext: 'Track invoices, payments, and client relationships in one place.',
    about_paragraph: 'ClientHub streamlines your billing workflow. Manage clients, send invoices, and track payments with an intuitive dashboard.',
    cta_label: 'Open dashboard',
    empty_state: 'No records yet. Create your first entry to get started.',
    footer_tagline: 'Built for professionals.',
  },
}

// ============================================================================
// Test 3: Blog Platform (hybrid auth, minimal nav, typography theme)
// ============================================================================

const blogContract: SchemaContract = {
  tables: [
    {
      name: 'post',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'slug', type: 'text', nullable: false, unique: true },
        { name: 'content', type: 'text' },
        { name: 'excerpt', type: 'text' },
        { name: 'cover_image_url', type: 'text' },
        { name: 'published', type: 'boolean', nullable: false, default: 'false' },
        { name: 'author_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
    {
      name: 'comment',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'post_id', type: 'uuid', nullable: false, references: { table: 'post', column: 'id' } },
        { name: 'author_name', type: 'text', nullable: false },
        { name: 'body', type: 'text', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
  ],
}

const adventurerTokens: ThemeTokens = {
  name: 'theme-adventurer',
  fonts: {
    display: 'Playfair Display',
    body: 'Inter',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap',
  },
  colors: {
    background: '#fffefc',
    foreground: '#000000',
    primary: '#000000',
    primaryForeground: '#fff7ed',
    secondary: '#000000',
    accent: '#f5f2ec',
    muted: '#f9efe2',
    border: '#ead9c4',
  },
  style: {
    borderRadius: '0.5rem',
    cardStyle: 'glass',
    navStyle: 'minimal',
    heroLayout: 'centered',
    spacing: 'normal',
    motion: 'subtle',
    imagery: 'minimal',
  },
  authPosture: 'hybrid',
  heroImages: [],
  heroQuery: 'writing blog modern',
  textSlots: {
    hero_headline: 'Stories Worth Telling',
    hero_subtext: 'A modern platform for writers who value craft and clarity.',
    about_paragraph: 'InkWell is a blog platform built for writers. Share your stories, engage with readers, and build your audience.',
    cta_label: 'Start reading',
    empty_state: 'Nothing here yet. Publish your first post to get started.',
    footer_tagline: 'Words matter.',
  },
}

// ============================================================================
// Tests
// ============================================================================

describe('Themed Dry-Run Pipeline', () => {
  describe('Test 1: Restaurant Menu (public, editorial, gourmetto)', () => {
    const themedFiles = generateThemedApp(restaurantContract, gourmettroTokens, 'Test Restaurant')

    it('generates homepage, about, contact routes', () => {
      expect(themedFiles).toHaveProperty('src/routes/index.tsx')
      expect(themedFiles).toHaveProperty('src/routes/about.tsx')
      expect(themedFiles).toHaveProperty('src/routes/contact.tsx')
    })

    it('does NOT generate auth routes for public posture', () => {
      expect(themedFiles).not.toHaveProperty('src/routes/auth/login.tsx')
      expect(themedFiles).not.toHaveProperty('src/routes/_authenticated/route.tsx')
      expect(themedFiles).not.toHaveProperty('src/routes/_authenticated/dashboard.tsx')
    })

    it('generates entity routes at top level (not under _authenticated)', () => {
      // Public posture → routes are NOT under _authenticated
      expect(themedFiles).toHaveProperty('src/routes/dishes/index.tsx')
      expect(themedFiles).toHaveProperty('src/routes/dishes/$id.tsx')
      expect(themedFiles).toHaveProperty('src/routes/menu-categories/index.tsx')
      expect(themedFiles).toHaveProperty('src/routes/menu-categories/$id.tsx')
    })

    it('homepage references entity data', () => {
      const homepage = themedFiles['src/routes/index.tsx']
      expect(homepage).toContain('supabase')
      expect(homepage).not.toContain('JSON.stringify')
    })

    it('slots are interpolated into generated pages', () => {
      const homepage = themedFiles['src/routes/index.tsx']
      expect(homepage).toContain('Savor Every Moment')
      expect(homepage).toContain('Discover our curated menu')
      expect(homepage).toContain('View menu')
      // Footer tagline appears in homepage footer section
      expect(homepage).toContain('Crafted with passion')

      const about = themedFiles['src/routes/about.tsx']
      expect(about).toContain('We bring together the finest ingredients')
    })

    it('generates themed CSS with oklch colors', () => {
      const css = themedFiles['src/index.css']
      expect(css).toContain('@theme')
      expect(css).toContain('oklch(')
      expect(css).toContain('--color-primary')
    })

    it('dish list page is a public gallery layout', () => {
      const dishList = themedFiles['src/routes/dishes/index.tsx']
      // Public pages use composed section layout, not CRUD admin table
      // Photography-heavy imagery → masonry grid (CSS columns) or grid-based layout
      expect(dishList).toMatch(/columns-|grid/)
      expect(dishList).toContain('Search')
      // Should NOT have CRUD forms on public pages
      expect(dishList).not.toContain('createMutation')
    })

    it('full blueprint passes tsc --noEmit', { timeout: 30000 }, () => {
      const blueprint = contractToBlueprint({
        appName: 'Gourmetto Restaurant',
        appDescription: 'Restaurant menu with categories and dishes',
        contract: restaurantContract,
      })

      const tsc = typeCheckBlueprint('restaurant', blueprint)
      if (!tsc.passed) {
        console.error('TSC errors for restaurant:\n', tsc.tscOutput)
      }
      try { rmSync(tsc.tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
      expect(tsc.passed).toBe(true)
    })

    it('passes scaffold validation', () => {
      const blueprint = contractToBlueprint({
        appName: 'Gourmetto Restaurant',
        appDescription: 'Restaurant menu with categories and dishes',
        contract: restaurantContract,
      })
      const allFiles = blueprint.fileTree.map((f) => ({ path: f.path, content: f.content }))
      const result = checkScaffold(allFiles)
      if (!result.passed) {
        console.error('Scaffold errors:', result.errors)
      }
      expect(result.passed).toBe(true)
    })
  })

  describe('Test 2: SaaS Dashboard (private, sidebar, luxus)', () => {
    const themedFiles = generateThemedApp(saasContract, luxusTokens, 'Test SaaS App')

    it('generates auth routes for private posture', () => {
      expect(themedFiles).toHaveProperty('src/routes/auth/login.tsx')
      expect(themedFiles).toHaveProperty('src/routes/_authenticated/route.tsx')
      expect(themedFiles).toHaveProperty('src/routes/_authenticated/dashboard.tsx')
    })

    it('generates entity routes under _authenticated', () => {
      expect(themedFiles).toHaveProperty('src/routes/_authenticated/clients/index.tsx')
      expect(themedFiles).toHaveProperty('src/routes/_authenticated/clients/$id.tsx')
      expect(themedFiles).toHaveProperty('src/routes/_authenticated/invoices/index.tsx')
      expect(themedFiles).toHaveProperty('src/routes/_authenticated/invoices/$id.tsx')
      expect(themedFiles).toHaveProperty('src/routes/_authenticated/payments/index.tsx')
      expect(themedFiles).toHaveProperty('src/routes/_authenticated/payments/$id.tsx')
    })

    it('invoice page has FK dropdown for client', () => {
      const invoiceList = themedFiles['src/routes/_authenticated/invoices/index.tsx']
      expect(invoiceList).toContain('client')
      expect(invoiceList).toContain('client_id')
    })

    it('payment page has FK dropdown for invoice', () => {
      const paymentList = themedFiles['src/routes/_authenticated/payments/index.tsx']
      expect(paymentList).toContain('invoice')
      expect(paymentList).toContain('invoice_id')
    })

    it('full blueprint passes tsc --noEmit', { timeout: 30000 }, () => {
      const blueprint = contractToBlueprint({
        appName: 'ClientHub',
        appDescription: 'SaaS invoicing dashboard',
        contract: saasContract,
      })

      const tsc = typeCheckBlueprint('saas', blueprint)
      if (!tsc.passed) {
        console.error('TSC errors for SaaS:\n', tsc.tscOutput)
      }
      try { rmSync(tsc.tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
      expect(tsc.passed).toBe(true)
    })

    it('passes scaffold validation', () => {
      const blueprint = contractToBlueprint({
        appName: 'ClientHub',
        appDescription: 'SaaS invoicing dashboard',
        contract: saasContract,
      })
      const allFiles = blueprint.fileTree.map((f) => ({ path: f.path, content: f.content }))
      const result = checkScaffold(allFiles)
      if (!result.passed) {
        console.error('Scaffold errors:', result.errors)
      }
      expect(result.passed).toBe(true)
    })
  })

  describe('Test 3: Blog Platform (hybrid, minimal, adventurer)', () => {
    const themedFiles = generateThemedApp(blogContract, adventurerTokens, 'Test Blog')

    it('generates auth routes for hybrid posture', () => {
      expect(themedFiles).toHaveProperty('src/routes/auth/login.tsx')
      expect(themedFiles).toHaveProperty('src/routes/_authenticated/route.tsx')
      expect(themedFiles).toHaveProperty('src/routes/_authenticated/dashboard.tsx')
    })

    it('generates mix of public and private entity routes', () => {
      // At least some entity routes should exist
      const allPaths = Object.keys(themedFiles)
      const entityPaths = allPaths.filter((p) =>
        p.includes('/posts/') || p.includes('/comments/'),
      )
      expect(entityPaths.length).toBeGreaterThanOrEqual(2) // at least list + detail for one entity
    })

    it('comment page has FK dropdown for post', () => {
      // Find the comments list page (could be under _authenticated or top-level)
      const commentListPath = Object.keys(themedFiles).find(
        (p) => p.includes('/comments/index.tsx'),
      )
      expect(commentListPath).toBeDefined()
      const commentList = themedFiles[commentListPath!]
      expect(commentList).toContain('post')
      expect(commentList).toContain('post_id')
    })

    it('full blueprint passes tsc --noEmit', { timeout: 30000 }, () => {
      const blueprint = contractToBlueprint({
        appName: 'InkWell',
        appDescription: 'A modern blog platform',
        contract: blogContract,
      })

      const tsc = typeCheckBlueprint('blog', blueprint)
      if (!tsc.passed) {
        console.error('TSC errors for blog:\n', tsc.tscOutput)
      }
      try { rmSync(tsc.tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
      expect(tsc.passed).toBe(true)
    })

    it('passes scaffold validation', () => {
      const blueprint = contractToBlueprint({
        appName: 'InkWell',
        appDescription: 'A modern blog platform',
        contract: blogContract,
      })
      const allFiles = blueprint.fileTree.map((f) => ({ path: f.path, content: f.content }))
      const result = checkScaffold(allFiles)
      if (!result.passed) {
        console.error('Scaffold errors:', result.errors)
      }
      expect(result.passed).toBe(true)
    })
  })

  describe('Test 4: Canape theme (domain-specific routes via section composition)', () => {
    const canapeTokens: ThemeTokens = {
      name: 'canape',
      fonts: {
        display: 'Playfair Display',
        body: 'Source Sans Pro',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Sans+Pro:wght@400;600&display=swap',
      },
      colors: {
        background: '#ffffff',
        foreground: '#1a1a1a',
        primary: '#2563eb',
        primaryForeground: '#ffffff',
        secondary: '#f3f4f6',
        accent: '#dc2626',
        muted: '#f3f4f6',
        border: '#e5e7eb',
      },
      style: {
        borderRadius: '0.375rem',
        cardStyle: 'elevated',
        navStyle: 'editorial',
        heroLayout: 'editorial',
        spacing: 'generous' as 'normal',
        motion: 'subtle',
        imagery: 'photography-heavy',
      },
      authPosture: 'public',
      heroImages: [],
      heroQuery: 'fine dining restaurant',
      textSlots: {
        hero_headline: 'A Taste of Excellence',
        hero_subtext: 'Seasonal menus, artisan techniques, and warm hospitality.',
        about_paragraph: 'We source the finest local ingredients for each dish.',
        cta_label: 'Make a reservation',
        empty_state: 'Nothing here yet.',
        footer_tagline: 'Crafted with passion.',
      },
    }

    const canapeContract = {
      tables: [
        {
          name: 'entities',
          columns: [
            { name: 'id', type: 'uuid' as const, primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'name', type: 'text' as const, nullable: false },
            { name: 'image_url', type: 'text' as const },
          ],
        },
        {
          name: 'menu_items',
          columns: [
            { name: 'id', type: 'uuid' as const, primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'name', type: 'text' as const, nullable: false },
            { name: 'category', type: 'text' as const, nullable: false },
            { name: 'price', type: 'numeric' as const, nullable: false },
          ],
        },
        {
          name: 'posts',
          columns: [
            { name: 'id', type: 'uuid' as const, primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text' as const, nullable: false },
            { name: 'slug', type: 'text' as const, nullable: false },
            { name: 'content', type: 'text' as const },
          ],
        },
        {
          name: 'pages',
          columns: [
            { name: 'id', type: 'uuid' as const, primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text' as const, nullable: false },
            { name: 'slug', type: 'text' as const, nullable: false },
            { name: 'content', type: 'text' as const },
          ],
        },
        {
          name: 'reservations',
          columns: [
            { name: 'id', type: 'uuid' as const, primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'name', type: 'text' as const, nullable: false },
            { name: 'email', type: 'text' as const, nullable: false },
          ],
        },
        {
          name: 'services_page',
          columns: [
            { name: 'id', type: 'uuid' as const, primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'name', type: 'text' as const, nullable: false },
            { name: 'url', type: 'text' as const, nullable: false },
            { name: 'order_index', type: 'integer' as const, nullable: false, default: '0' },
          ],
        },
        {
          name: 'testimonials',
          columns: [
            { name: 'id', type: 'uuid' as const, primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'quote', type: 'text' as const, nullable: false },
            { name: 'author_name', type: 'text' as const, nullable: false },
          ],
        },
      ],
    }

    const canapeFiles = generateThemedApp(canapeContract, canapeTokens, 'TestRestaurant')

    it('canape theme produces a homepage via section composition', () => {
      expect(canapeFiles).toHaveProperty('src/routes/index.tsx')
      expect(canapeFiles['src/routes/index.tsx']).toContain('createFileRoute')
    })

    it('canape theme produces menu archive route at /menu/index.tsx', () => {
      expect(canapeFiles).toHaveProperty('src/routes/menu/index.tsx')
      expect(canapeFiles['src/routes/menu/index.tsx']).toContain('menu_items')
    })

    it('canape theme produces menu category route at /menu/$category.tsx (not /index.tsx)', () => {
      // routePathToFilePath('/menu/$category') → src/routes/menu/$category.tsx
      expect(canapeFiles).toHaveProperty('src/routes/menu/$category.tsx')
      expect(canapeFiles).not.toHaveProperty('src/routes/menu/$category/index.tsx')
    })

    it('canape theme produces news archive route at /news/index.tsx', () => {
      expect(canapeFiles).toHaveProperty('src/routes/news/index.tsx')
    })

    it('canape theme produces news slug route at /news/$slug.tsx (not /index.tsx)', () => {
      // routePathToFilePath('/news/$slug') → src/routes/news/$slug.tsx
      expect(canapeFiles).toHaveProperty('src/routes/news/$slug.tsx')
      expect(canapeFiles).not.toHaveProperty('src/routes/news/$slug/index.tsx')
    })

    it('canape theme produces slug route at /$slug.tsx (not /$slug/index.tsx)', () => {
      // routePathToFilePath('/$slug') → src/routes/$slug.tsx
      expect(canapeFiles).toHaveProperty('src/routes/$slug.tsx')
      expect(canapeFiles).not.toHaveProperty('src/routes/$slug/index.tsx')
    })

    it('canape theme produces reservations route at /reservations/index.tsx', () => {
      expect(canapeFiles).toHaveProperty('src/routes/reservations/index.tsx')
      expect(canapeFiles['src/routes/reservations/index.tsx']).toContain('reservations')
    })

    it('canape does NOT generate the old two-track hand-crafted routes', () => {
      // Verify old path patterns (with /index.tsx for param routes) are gone
      expect(canapeFiles).not.toHaveProperty('src/routes/menu/$category/index.tsx')
      expect(canapeFiles).not.toHaveProperty('src/routes/news/$slug/index.tsx')
      expect(canapeFiles).not.toHaveProperty('src/routes/$slug/index.tsx')
    })

    it('canape homepage does not use JSON.stringify (data is live, not hardcoded)', () => {
      const homepage = canapeFiles['src/routes/index.tsx']
      expect(homepage).not.toContain('JSON.stringify')
    })

    it('canape theme does not generate auth routes for public posture', () => {
      expect(canapeFiles).not.toHaveProperty('src/routes/auth/login.tsx')
      expect(canapeFiles).not.toHaveProperty('src/routes/_authenticated/route.tsx')
    })
  })

  describe('Layout archetypes', () => {
    it('derives archetype deterministically from navStyle + heroLayout', () => {
      expect(deriveArchetype({ ...gourmettroTokens, style: { ...gourmettroTokens.style, navStyle: 'sidebar', heroLayout: 'split' } })).toBe('dashboard')
      expect(deriveArchetype({ ...gourmettroTokens, style: { ...gourmettroTokens.style, navStyle: 'minimal', heroLayout: 'fullbleed' } })).toBe('gallery')
      expect(deriveArchetype({ ...gourmettroTokens, style: { ...gourmettroTokens.style, navStyle: 'editorial', heroLayout: 'split' } })).toBe('editorial')
      expect(deriveArchetype({ ...gourmettroTokens, style: { ...gourmettroTokens.style, navStyle: 'top-bar', heroLayout: 'centered' } })).toBe('soft')
      expect(deriveArchetype({ ...gourmettroTokens, style: { ...gourmettroTokens.style, navStyle: 'top-bar', heroLayout: 'split' } })).toBe('corporate')
    })

    it('editorial tokens produce editorial-nav + editorial-hero sections', () => {
      const tokens: ThemeTokens = {
        ...gourmettroTokens,
        style: { ...gourmettroTokens.style, navStyle: 'editorial', heroLayout: 'editorial' },
      }
      const homepage = generateThemedApp(restaurantContract, tokens, 'Test Restaurant')['src/routes/index.tsx']
      // Editorial hero uses serif split layout with grid-cols-[3fr_2fr]
      expect(homepage).toContain('md:grid-cols-[3fr_2fr]')
      // Editorial nav
      expect(homepage).toContain('Editorial navigation')
      // Display font
      expect(homepage).toContain('font-[family-name:var(--font-display)]')
    })

    it('fullbleed tokens produce fullbleed-hero with dark overlay', () => {
      const tokens: ThemeTokens = {
        ...gourmettroTokens,
        style: { ...gourmettroTokens.style, navStyle: 'minimal', heroLayout: 'fullbleed' },
      }
      const homepage = generateThemedApp(restaurantContract, tokens, 'Test Restaurant')['src/routes/index.tsx']
      // Fullbleed hero uses min-h-screen with gradient overlay
      expect(homepage).toContain('min-h-screen')
      expect(homepage).toContain('from-black/70')
      expect(homepage).toContain('font-[family-name:var(--font-display)]')
    })

    it('split hero tokens produce two-column grid layout', () => {
      const tokens: ThemeTokens = {
        ...gourmettroTokens,
        style: { ...gourmettroTokens.style, navStyle: 'top-bar', heroLayout: 'split' },
      }
      const homepage = generateThemedApp(restaurantContract, tokens, 'Test Restaurant')['src/routes/index.tsx']
      // Split hero uses grid 2-col
      expect(homepage).toContain('md:grid-cols-2')
      expect(homepage).toContain('font-[family-name:var(--font-display)]')
    })

    it('centered hero tokens produce centered text layout', () => {
      const tokens: ThemeTokens = {
        ...gourmettroTokens,
        style: { ...gourmettroTokens.style, navStyle: 'centered', heroLayout: 'centered' },
      }
      const homepage = generateThemedApp(restaurantContract, tokens, 'Test Restaurant')['src/routes/index.tsx']
      // Centered hero uses text-center
      expect(homepage).toContain('text-center')
      expect(homepage).toContain('font-[family-name:var(--font-display)]')
    })

    it('sidebar nav tokens produce persistent sidebar layout', () => {
      const tokens: ThemeTokens = {
        ...gourmettroTokens,
        style: { ...gourmettroTokens.style, navStyle: 'sidebar', heroLayout: 'split' },
      }
      const homepage = generateThemedApp(restaurantContract, tokens, 'Test Restaurant')['src/routes/index.tsx']
      // Sidebar nav has h-screen fixed sidebar with w-64
      expect(homepage).toContain('h-screen')
      expect(homepage).toContain('w-64')
    })
  })
})
