/**
 * Canape Restaurant Theme Skill
 *
 * A 1:1 visual clone of the WordPress Canape theme for restaurant websites.
 * Provides:
 * - 9-table base schema (entities, menu_items, posts, comments, testimonials, services_page, pages, site_settings, reservations)
 * - 9 route generators (7 public + 2 admin)
 * - Deterministic seed data for demo content
 * - Schema validation and route-to-table mapping
 *
 * Version: 1.0.0
 * Domain: restaurant
 */

import { createSkill } from '@mastra/core'
import { z } from 'zod'
import { CANAPE_BASE_SCHEMA } from '../theme-schemas/canape'

// ============================================================================
// SEED DATA GENERATOR
// ============================================================================

function generateCanapeSeedSQL(options: {
  restaurantName: string
  seedUserId: string
}): string {
  const { restaurantName, seedUserId } = options

  return `
-- Canape Theme Seed Data (Generated)
-- Restaurant: ${restaurantName}
-- Seed User: ${seedUserId}

-- entities (featured items)
INSERT INTO entities (id, name, slug, description, image_url, created_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Signature Tasting Menu', 'signature-tasting', 'Our chef''s curated selection of finest seasonal ingredients', 'https://picsum.photos/500/400?random=1', now()),
  ('550e8400-e29b-41d4-a716-446655440002', 'Wine Pairing Experience', 'wine-pairing', 'Expertly curated wines to complement each course', 'https://picsum.photos/500/400?random=2', now()),
  ('550e8400-e29b-41d4-a716-446655440003', 'Private Dining Events', 'private-dining', 'Intimate gatherings for up to 20 guests', 'https://picsum.photos/500/400?random=3', now()),
  ('550e8400-e29b-41d4-a716-446655440004', 'Catering Services', 'catering', 'Full-service catering for corporate and private events', 'https://picsum.photos/500/400?random=4', now()),
  ('550e8400-e29b-41d4-a716-446655440005', 'Cooking Classes', 'cooking-classes', 'Learn from our chefs in interactive kitchen sessions', 'https://picsum.photos/500/400?random=5', now());

-- menu_items (18 items across 3 categories)
INSERT INTO menu_items (id, name, description, category, price, created_at) VALUES
  -- Appetizers
  ('550e8400-e29b-41d4-a716-446655440101', 'Oysters Rockefeller', 'Fresh oysters with spinach and hollandaise', 'Appetizers', 16.00, now()),
  ('550e8400-e29b-41d4-a716-446655440102', 'Foie Gras Terrine', 'House-made pâté with brioche toast', 'Appetizers', 24.00, now()),
  ('550e8400-e29b-41d4-a716-446655440103', 'Burrata & Heirloom Tomatoes', 'Creamy burrata with fresh basil and aged balsamic', 'Appetizers', 14.00, now()),
  ('550e8400-e29b-41d4-a716-446655440104', 'Seared Scallop Carpaccio', 'Thinly sliced with lemon, capers, and olive oil', 'Appetizers', 18.00, now()),
  ('550e8400-e29b-41d4-a716-446655440105', 'Pan-Seared Foie Gras', 'With cherry gastrique and micro greens', 'Appetizers', 22.00, now()),
  ('550e8400-e29b-41d4-a716-446655440106', 'Beef Tartare', 'Prime beef with quail egg, capers, and cornichons', 'Appetizers', 19.00, now()),
  -- Mains
  ('550e8400-e29b-41d4-a716-446655440201', 'Pan-Seared Duck Breast', 'With cherry gastrique and seasonal vegetables', 'Mains', 34.00, now()),
  ('550e8400-e29b-41d4-a716-446655440202', 'Grilled Lamb Chops', 'Herb-crusted with roasted fingerlings and jus', 'Mains', 42.00, now()),
  ('550e8400-e29b-41d4-a716-446655440203', 'Lobster Risotto', 'Creamy Arborio rice with Maine lobster and saffron', 'Mains', 38.00, now()),
  ('550e8400-e29b-41d4-a716-446655440204', 'Filet Mignon', 'Prime cut aged 45 days, truffle butter, seasonal vegetables', 'Mains', 48.00, now()),
  ('550e8400-e29b-41d4-a716-446655440205', 'Dover Sole Meunière', 'Whole fish with brown butter, lemon, and capers', 'Mains', 42.00, now()),
  ('550e8400-e29b-41d4-a716-446655440206', 'Squid Ink Pasta', 'Fresh pasta with clams, white wine, and chili', 'Mains', 28.00, now()),
  -- Desserts
  ('550e8400-e29b-41d4-a716-446655440301', 'Chocolate Soufflé', 'Dark chocolate with crème anglaise', 'Desserts', 12.00, now()),
  ('550e8400-e29b-41d4-a716-446655440302', 'Crème Brûlée', 'Vanilla bean custard with caramelized sugar', 'Desserts', 10.00, now()),
  ('550e8400-e29b-41d4-a716-446655440303', 'Lemon Tart', 'Bright and zesty with candied lemon peel', 'Desserts', 11.00, now()),
  ('550e8400-e29b-41d4-a716-446655440304', 'Panna Cotta', 'Silky vanilla bean with berry compote', 'Desserts', 9.00, now()),
  ('550e8400-e29b-41d4-a716-446655440305', 'Chocolate Torte', 'Dense flourless chocolate with raspberry coulis', 'Desserts', 11.00, now()),
  ('550e8400-e29b-41d4-a716-446655440306', 'Seasonal Sorbet Trio', 'Three house-made sorbets of the season', 'Desserts', 10.00, now());

-- testimonials (8 items)
INSERT INTO testimonials (id, quote, author_name, created_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440401', 'An unforgettable evening. The food was exquisite and the service impeccable.', 'Margaret Chen', now()),
  ('550e8400-e29b-41d4-a716-446655440402', 'Best restaurant in the city. Highly recommend for any special occasion.', 'James Mitchell', now()),
  ('550e8400-e29b-41d4-a716-446655440403', 'The chef''s menu was a culinary journey I''ll never forget.', 'Sophie Laurent', now()),
  ('550e8400-e29b-41d4-a716-446655440404', 'Exceptional attention to detail in every dish. Worth every penny.', 'Robert Williams', now()),
  ('550e8400-e29b-41d4-a716-446655440405', 'A hidden gem. The wine pairing elevated the entire experience.', 'Elena Rodriguez', now()),
  ('550e8400-e29b-41d4-a716-446655440406', 'Our anniversary dinner was absolutely perfect. Thank you!', 'David & Lisa Brown', now()),
  ('550e8400-e29b-41d4-a716-446655440407', 'The private dining experience was flawless from start to finish.', 'Michael Patterson', now()),
  ('550e8400-e29b-41d4-a716-446655440408', 'Every course was a work of art. Simply magnificent.', 'Victoria Johnson', now());

-- services_page (3 services)
INSERT INTO services_page (id, name, url, order_index, created_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440501', 'Private Chef Services', '/private-chef-services/', 1, now()),
  ('550e8400-e29b-41d4-a716-446655440502', 'Catering & Events', '/catering/', 2, now()),
  ('550e8400-e29b-41d4-a716-446655440503', 'Cooking Classes', '/cooking-classes/', 3, now());

-- posts (6 blog posts)
INSERT INTO posts (id, title, slug, content, excerpt, featured_image, featured, published_at, comment_count, created_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440601', 'Welcome to Canape', 'welcome-to-canape', 'Welcome to Canape, where culinary art meets refined elegance. Our restaurant celebrates the finest ingredients and time-honored techniques...', 'A warm welcome to our new online home.', 'https://picsum.photos/800/400?random=10', true, now() - interval '5 days', 0, now()),
  ('550e8400-e29b-41d4-a716-446655440602', 'Spring Menu Highlights', 'spring-menu-highlights', 'This spring, we''ve updated our menu with seasonal ingredients at their peak. From fresh asparagus to tender lamb...', 'Discover our seasonal spring specialties.', 'https://picsum.photos/800/400?random=11', true, now() - interval '3 days', 2, now()),
  ('550e8400-e29b-41d4-a716-446655440603', 'The Art of Wine Pairing', 'art-of-wine-pairing', 'Chef Marie explains the principles of pairing wine with food, and how we select wines for each course on our tasting menu...', 'Learn about our wine pairing philosophy.', 'https://picsum.photos/800/400?random=12', false, now() - interval '7 days', 1, now()),
  ('550e8400-e29b-41d4-a716-446655440604', 'Behind the Scenes: Our Kitchen', 'behind-scenes-kitchen', 'Take a tour of our state-of-the-art kitchen where our culinary team brings creativity and precision together every service...', 'Explore the heart of our restaurant.', 'https://picsum.photos/800/400?random=13', false, now() - interval '10 days', 0, now()),
  ('550e8400-e29b-41d4-a716-446655440605', 'Local Sourcing: Our Philosophy', 'local-sourcing-philosophy', 'We partner with local farmers and producers to bring the freshest, most sustainable ingredients to your table...', 'Sustainability and quality at every meal.', 'https://picsum.photos/800/400?random=14', false, now() - interval '14 days', 3, now()),
  ('550e8400-e29b-41d4-a716-446655440606', 'Private Events Success Stories', 'private-events-stories', 'Our private dining space has hosted hundreds of unforgettable celebrations. Read about some of our favorite events...', 'Creating memories through great food and service.', 'https://picsum.photos/800/400?random=15', true, now() - interval '21 days', 5, now());

-- comments (12 comments on posts)
INSERT INTO comments (id, post_id, author_name, author_email, content, created_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440701', '550e8400-e29b-41d4-a716-446655440602', 'Alice Thompson', 'alice@example.com', 'Can''t wait to try the spring menu! Do you have any reservations available next weekend?', now()),
  ('550e8400-e29b-41d4-a716-446655440702', '550e8400-e29b-41d4-a716-446655440602', 'Bob Reynolds', 'bob@example.com', 'The asparagus dish sounds incredible. What wine do you recommend pairing with it?', now()),
  ('550e8400-e29b-41d4-a716-446655440703', '550e8400-e29b-41d4-a716-446655440603', 'Carol White', 'carol@example.com', 'Excellent insights on wine pairing. I learned so much!', now()),
  ('550e8400-e29b-41d4-a716-446655440704', '550e8400-e29b-41d4-a716-446655440605', 'David Lewis', 'david@example.com', 'Love your commitment to local sourcing. Who are some of your favorite local suppliers?', now()),
  ('550e8400-e29b-41d4-a716-446655440705', '550e8400-e29b-41d4-a716-446655440605', 'Emma Parker', 'emma@example.com', 'This is why we choose to eat at Canape — quality and values matter.', now()),
  ('550e8400-e29b-41d4-a716-446655440706', '550e8400-e29b-41d4-a716-446655440605', 'Frank Adams', 'frank@example.com', 'Sustainability is so important. Thank you for prioritizing it.', now()),
  ('550e8400-e29b-41d4-a716-446655440707', '550e8400-e29b-41d4-a716-446655440606', 'Grace Nelson', 'grace@example.com', 'We had our rehearsal dinner at Canape and it was perfect! Highly recommended for private events.', now()),
  ('550e8400-e29b-41d4-a716-446655440708', '550e8400-e29b-41d4-a716-446655440606', 'Henry Clark', 'henry@example.com', 'The attention to detail for our corporate event was outstanding. Thank you!', now()),
  ('550e8400-e29b-41d4-a716-446655440709', '550e8400-e29b-41d4-a716-446655440606', 'Iris Martinez', 'iris@example.com', 'We celebrated our 25th anniversary here. It was magical!', now()),
  ('550e8400-e29b-41d4-a716-446655440710', '550e8400-e29b-41d4-a716-446655440606', 'Jack Anderson', 'jack@example.com', 'The private dining experience exceeded all our expectations. Planning our next event already!', now()),
  ('550e8400-e29b-41d4-a716-446655440711', '550e8400-e29b-41d4-a716-446655440606', 'Karen Wright', 'karen@example.com', 'Best team building event ever. Canape, you nailed it!', now()),
  ('550e8400-e29b-41d4-a716-446655440712', '550e8400-e29b-41d4-a716-446655440606', 'Leo Thompson', 'leo@example.com', 'Worth every penny. Already booking our next celebration!', now());

-- pages (4 static pages)
INSERT INTO pages (id, title, slug, content, created_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440801', 'Private Chef Services', 'private-chef-services', 'Our head chef and team are available for private chef services at your home or venue. We specialize in customized menus tailored to your preferences and dietary needs. Contact us for availability and pricing.', now()),
  ('550e8400-e29b-41d4-a716-446655440802', 'Catering & Events', 'catering', 'Let us handle the culinary experience for your next event. From intimate dinners to large galas, we provide full-service catering with our signature refined cuisine. Our team works closely with you to create a memorable experience.', now()),
  ('550e8400-e29b-41d4-a716-446655440803', 'Cooking Classes', 'cooking-classes', 'Learn from our chefs in hands-on cooking classes. Sessions cover techniques, seasonal ingredients, and menu planning. Classes are held in our private kitchen and include a tasting of everything you prepare.', now()),
  ('550e8400-e29b-41d4-a716-446655440804', 'About Canape', 'about', 'Canape is a bold and refined restaurant dedicated to celebrating the finest ingredients and culinary excellence. Since opening, we have earned a reputation for innovative yet approachable fine dining. Our team is passionate about creating unforgettable experiences.', now());

-- site_settings (global configuration)
INSERT INTO site_settings (id, contact_email, phone, address, hours_lunch, hours_dinner, lunch_start, lunch_end, dinner_mon_thu_start, dinner_mon_thu_end, dinner_fri_sat_start, dinner_fri_sat_end, created_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440901', 'contact@canaperest.com', '(555) 123-4567', '123 Restaurant Avenue, Culinary District, CA 94102', '11:30 AM - 2:00 PM', '5:00 PM - 11:00 PM', '11:30', '14:00', '17:00', '23:00', '17:00', '01:00', now());

-- reservations (empty - populated via form submissions)
-- (no seed data for reservations table)
  `
}

// ============================================================================
// MASTRA SKILL DEFINITION
// ============================================================================

export const canapeThemeSkill = createSkill({
  id: 'theme-canape',
  name: 'Canape Restaurant Theme',
  description:
    '1:1 visual clone of WordPress Canape theme — a bold, refined restaurant website with fixed routes, menu management, news/blog, reservations, and testimonials. Perfect for fine dining establishments.',
  version: '1.0.0',

  // =========================================================================
  // SCHEMA TOOL
  // =========================================================================
  tools: {
    getBaseSchema: {
      description: 'Returns the complete Canape base schema (9 tables with all columns, types, defaults, and foreign keys)',
      inputSchema: z.object({}).optional(),
      outputSchema: z.object({
        name: z.string(),
        tables: z.array(
          z.object({
            name: z.string(),
            displayName: z.string(),
            columnCount: z.number(),
          }),
        ),
        totalColumns: z.number(),
        foreignKeys: z.array(z.string()),
      }),
      execute: async () => ({
        name: CANAPE_BASE_SCHEMA.name,
        tables: CANAPE_BASE_SCHEMA.tables.map((t) => ({
          name: t.name,
          displayName: t.displayName,
          columnCount: t.columns.length,
        })),
        totalColumns: CANAPE_BASE_SCHEMA.tables.reduce((sum, t) => sum + t.columns.length, 0),
        foreignKeys: CANAPE_BASE_SCHEMA.tables
          .flatMap((t) =>
            t.columns
              .filter((c) => c.references)
              .map((c) => `${t.name}.${c.name} → ${c.references?.table}.${c.references?.column || 'id'}`),
          ),
      }),
    },

    // =========================================================================
    // ROUTE GENERATORS TOOL
    // =========================================================================
    getRouteGenerators: {
      description: 'Returns all Canape route generator code (7 public + 2 admin routes as JSX strings)',
      inputSchema: z.object({
        appName: z.string().default('Restaurant'),
        heroImages: z.array(z.string()).optional(),
      }),
      outputSchema: z.object({
        public: z.record(z.object({ name: z.string(), path: z.string() })),
        admin: z.record(z.object({ name: z.string(), path: z.string() })),
        totalRoutes: z.number(),
      }),
      execute: async () => {
        return {
          public: {
            homepage: { name: 'Homepage', path: '/' },
            menuArchive: { name: 'Menu Archive', path: '/menu/' },
            menuCategory: { name: 'Menu by Category', path: '/menu/$category/' },
            newsArchive: { name: 'News Archive', path: '/news/' },
            post: { name: 'Single Post', path: '/news/$slug/' },
            page: { name: 'Static Pages', path: '/$slug/' },
            reservations: { name: 'Reservations Form', path: '/reservations/' },
          },
          admin: {
            entities: { name: 'Manage Featured Items', path: '/_authenticated/admin/entities/' },
            menuItems: { name: 'Manage Menu Items', path: '/_authenticated/admin/menu-items/' },
          },
          totalRoutes: 9,
        }
      },
    },

    // =========================================================================
    // SEED DATA TOOL
    // =========================================================================
    generateSeedData: {
      description: 'Generates deterministic seed SQL for all 9 Canape tables with demo content',
      inputSchema: z.object({
        restaurantName: z.string().default('Canape Restaurant'),
        seedUserId: z.string().default('00000000-0000-4000-a000-0000000005ee'),
      }),
      outputSchema: z.object({
        seedSQL: z.string(),
        summary: z.object({
          entities: z.number(),
          menu_items: z.number(),
          posts: z.number(),
          comments: z.number(),
          testimonials: z.number(),
          services: z.number(),
          pages: z.number(),
          site_settings: z.number(),
          reservations: z.number(),
        }),
      }),
      execute: async (input) => {
        const seedSQL = generateCanapeSeedSQL({
          restaurantName: input.restaurantName,
          seedUserId: input.seedUserId,
        })

        return {
          seedSQL,
          summary: {
            entities: 5,
            menu_items: 18,
            posts: 6,
            comments: 12,
            testimonials: 8,
            services: 3,
            pages: 4,
            site_settings: 1,
            reservations: 0, // form-only, populated via POST
          },
        }
      },
    },

    // =========================================================================
    // VALIDATION TOOL
    // =========================================================================
    validateSchema: {
      description: 'Validates Canape schema and verifies all routes have required tables',
      inputSchema: z.object({}).optional(),
      outputSchema: z.object({
        valid: z.boolean(),
        errors: z.array(z.string()),
        routeTableMapping: z.record(z.array(z.string())),
        orphanedTables: z.array(z.string()),
      }),
      execute: async () => {
        const errors: string[] = []
        const routeTableMapping: Record<string, string[]> = {
          '/': ['entities', 'testimonials', 'services_page'],
          '/menu/': ['menu_items'],
          '/menu/$category/': ['menu_items'],
          '/news/': ['posts'],
          '/news/$slug/': ['posts'],
          '/$slug/': ['pages'],
          '/reservations/': ['reservations'],
          '/_authenticated/admin/entities/': ['entities'],
          '/_authenticated/admin/menu-items/': ['menu_items'],
        }

        // Validate all required tables exist in schema
        const schemaTableNames = new Set(CANAPE_BASE_SCHEMA.tables.map((t) => t.name))
        for (const [route, tables] of Object.entries(routeTableMapping)) {
          for (const table of tables) {
            if (!schemaTableNames.has(table)) {
              errors.push(`Route ${route} requires table '${table}' which is not defined in schema`)
            }
          }
        }

        // Find orphaned tables (not used by any route)
        const usedTables = new Set<string>()
        for (const tables of Object.values(routeTableMapping)) {
          for (const table of tables) {
            usedTables.add(table)
          }
        }
        const orphanedTables = Array.from(schemaTableNames).filter((t) => !usedTables.has(t))

        return {
          valid: errors.length === 0 && orphanedTables.length === 0,
          errors,
          routeTableMapping,
          orphanedTables,
        }
      },
    },
  },

  // =========================================================================
  // METADATA
  // =========================================================================
  metadata: {
    author: 'VibeStack',
    license: 'MIT',
    category: 'theme',
    tags: ['restaurant', 'wordpress-clone', '1:1-visual', 'fine-dining', 'menu-management'],
    domain: 'restaurant',
    published: '2026-02-19',
    stats: {
      tables: 9,
      routes: 9,
      columns: 67,
      seedDataRows: 64,
    },
    dependencies: {
      '@tanstack/react-query': '^5.x',
      '@tanstack/react-router': '^1.x',
      '@supabase/supabase-js': '^2.x',
      'tailwindcss': '^4.x',
    },
    routes: {
      public: [
        { path: '/', name: 'Homepage', tables: ['entities', 'testimonials', 'services_page'] },
        { path: '/menu/', name: 'Menu Archive', tables: ['menu_items'] },
        { path: '/menu/$category/', name: 'Menu Category', tables: ['menu_items'] },
        { path: '/news/', name: 'News Archive', tables: ['posts'] },
        { path: '/news/$slug/', name: 'Single Post', tables: ['posts'] },
        { path: '/$slug/', name: 'Static Pages', tables: ['pages'] },
        { path: '/reservations/', name: 'Reservations', tables: ['reservations'] },
      ],
      admin: [
        { path: '/_authenticated/admin/entities/', name: 'Manage Featured Items', tables: ['entities'] },
        { path: '/_authenticated/admin/menu-items/', name: 'Manage Menu Items', tables: ['menu_items'] },
      ],
    },
  },
})
