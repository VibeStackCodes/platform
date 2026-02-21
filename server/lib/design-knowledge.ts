/**
 * design-knowledge.ts
 *
 * Design knowledge for the Creative Director agent and page generators.
 *
 * - getDesignKnowledge(): Full design principles for the Creative Director agent
 *   (typography, color theory, layout patterns, auth). ~3K tokens.
 * - getCondensedDesignRules(): Condensed rules for per-page code generation.
 *   ~1K tokens — keeps per-page token counts low.
 */

/**
 * Returns the full design knowledge base for the Creative Director agent.
 * Covers typography, color theory, layout patterns, sitemap principles,
 * auth configuration, and footer patterns.
 */
export function getDesignKnowledge(): string {
  return `## DESIGN KNOWLEDGE BASE

### Typography Principles

NEVER use these fonts (too generic, overused):
- Inter, Roboto, Arial, Helvetica, Open Sans, Nunito (unless theme tokens already specify them)

USE these distinctive font pairings instead:
- Editorial/Magazine: Playfair Display (display) + Source Serif 4 (body)
- Luxury/Restaurant: Cormorant Garamond (display) + Libre Baskerville (body)
- Creative/Portfolio: Syne (display) + DM Mono (body)
- Modern SaaS/Dashboard: DM Sans (display) + DM Sans (body)
- Bold/Startup: Space Grotesk (display) + Outfit (body)
- Artisan/Craft: Fraunces (display) + Crimson Pro (body)
- Scientific/Technical: IBM Plex Serif (display) + IBM Plex Mono (body)
- Warm/Lifestyle: Lora (display) + Mulish (body)

Tailwind headline classes for visual impact:
- Impact headline: "text-5xl md:text-7xl font-black tracking-tighter leading-none"
- Editorial headline: "text-4xl md:text-6xl font-bold tracking-tight"
- Elegant headline: "text-3xl md:text-5xl font-semibold leading-snug"
- Condensed headline: "text-5xl md:text-8xl font-extrabold uppercase tracking-widest"

### Color Theory

NEVER use generic blue as primary (#2b6cb0, #3182ce, #4299e1).
NEVER use black/white as the only palette — always include a branded accent.

Dominant + Sharp Accent formula:
- One dominant brand color fills at least 60% of palette decisions
- One sharp accent color creates visual tension (complementary or split-complementary)
- Muted neutrals complete the palette without competing

Base themes by domain (override with theme tokens if provided):
- Restaurant/Food: warm parchment bg (#faf7f2), deep burgundy primary (#7c2d12), gold accent (#d97706)
- Photography/Art: near-black bg (#0a0a0a), warm white fg (#f5f5f0), amber accent (#f59e0b)
- Finance/Analytics: cool slate bg (#f8fafc), navy primary (#1e3a5f), emerald accent (#059669)
- Health/Wellness: sage bg (#f0f4f1), forest green primary (#2d6a4f), coral accent (#e07a5f)
- SaaS/Startup: white bg (#ffffff), electric indigo primary (#4f46e5), lime accent (#84cc16)
- Creative Agency: off-white bg (#fafaf8), jet black primary (#111111), neon yellow accent (#fde047)
- Real Estate: light grey bg (#f9fafb), charcoal primary (#374151), terracotta accent (#c2714f)
- Education: warm cream bg (#fffbf5), deep teal primary (#0f4c5c), marigold accent (#f59e0b)
- Nonprofit: pure white bg (#ffffff), deep navy primary (#1e3a8a), coral accent (#ef4444)

Dark mode palettes (use when domain signals: photography, nightlife, luxury, tech):
- Background: #0c0c0c or #111111
- Foreground: #f5f5f5 or #ececec
- Card: #1a1a1a or #181818
- Border: #2a2a2a or #333333

### Layout & Navigation Patterns

Nav styles:
- sticky-blur: Standard SaaS/product nav, sticky with backdrop-filter blur
- transparent-hero: Overlays the hero image, turns opaque on scroll (luxury, photography)
- sidebar: Persistent left nav for admin/dashboard apps
- editorial: Top bar with generous spacing, large logo + inline nav links (magazines, blogs)

Hero patterns:
- fullbleed: Full-viewport image with overlay text — for photography, restaurants, luxury
- split: 50/50 content+image side-by-side — for SaaS, products, startups
- centered: Centered headline on gradient or solid bg — for landing pages, simple apps
- editorial: Asymmetric layout with large expressive typography — for magazines, blogs

Card styles per domain:
- elevated: shadow-lg hover:shadow-xl — warm/lifestyle, e-commerce
- flat: border border-border — clean SaaS, dashboards
- glass: bg-card/70 backdrop-blur-md — dark themes, photography, luxury
- bordered: border-2 border-primary/20 — editorial, nonprofit

### Sitemap Principles

Archetype classification:
- static: No database. All content is hardcoded inline. Routes: /, /about, /contact, /pricing
- content: Read-only DB queries. Shows lists and detail pages. No write forms.
  Routes: /, /{entities}/, /{entities}/$slug, /about, /contact
- crud: Full CRUD per entity. List + detail + create + edit routes.
  Routes: /, /{entities}/, /{entities}/$id, /{entities}/new, /{entities}/$id/edit, /auth/login, /auth/register

Route naming rules (domain-specific language, never generic CRUD names):
- blog posts → /journal/ or /articles/ (NOT /posts/)
- food/restaurant items → /menu/ (NOT /menu-items/)
- team members → /team/ (NOT /members/)
- portfolio work → /work/ or /projects/ (NOT /portfolio-items/)
- news → /news/ or /stories/ (NOT /news-items/)
- products → /shop/ or /catalog/ (NOT /products-list/)

TanStack Router file naming (file-based routing conventions):
- "/" → routes/index.tsx
- "/about" → routes/about.tsx
- "/menu/" → routes/menu/index.tsx
- "/menu/$slug" → routes/menu/$slug.tsx
- "/auth/login" → routes/auth/login.tsx
- "/auth/register" → routes/auth/register.tsx
- Protected pages → routes/_authenticated/route.tsx (auth guard) + routes/_authenticated/dashboard.tsx

### shadcn/ui Components Reference

Navigation: NavigationMenu, Sheet (mobile drawer), Drawer, Command (search)
Cards/Lists: Card, CardHeader, CardContent, Table, Badge, Avatar, Skeleton
Forms: Form, FormField, FormItem, FormLabel, FormControl, FormMessage, Input, Select, Textarea, Checkbox, Switch
Feedback: Toast, Alert, AlertDialog, Skeleton, Progress, Spinner
Layout: Tabs, Accordion, Separator, ScrollArea, AspectRatio
Overlays: Dialog, Popover, DropdownMenu, Tooltip, Sheet, HoverCard

### Lucide Icons Reference by Domain

Restaurant/Food: UtensilsCrossed, ChefHat, Wine, Coffee, Star, MapPin, Phone, Clock, Calendar
E-commerce: ShoppingCart, Heart, Tag, Package, CreditCard, Truck, Star, Search
Blog/Editorial: BookOpen, Pen, Calendar, User, Tag, Clock, ArrowRight, Share2
Dashboard/Admin: BarChart2, TrendingUp, Users, Settings, Bell, Search, Filter, Plus, Edit, Trash2
Real Estate: Home, MapPin, Bed, Bath, Square, Car, Building2, DollarSign
Photography/Art: Camera, Image, Grid3x3, Eye, Download, Share2, Aperture
Health/Wellness: Heart, Activity, Pill, Calendar, User, Shield, Star, Stethoscope

### Auth Patterns

public apps (authPosture = 'public'):
- publicRoutes: ["*"] — all routes accessible
- privateRoutes: []
- loginRoute: "/auth/login"

hybrid apps (authPosture = 'hybrid'):
- publicRoutes: ["/", "/{entities}/", "/{entities}/$id", "/about", "/contact"]
- privateRoutes: ["/{entities}/new", "/{entities}/$id/edit", "/dashboard"]
- loginRoute: "/auth/login"

private apps (authPosture = 'private'):
- publicRoutes: ["/auth/login", "/auth/register"]
- privateRoutes: ["*"] — all app routes require auth
- loginRoute: "/auth/login"

### Footer Patterns

- multi-column: Multiple link columns + social icons + copyright. Best for SaaS, e-commerce, corporate.
- minimal: Single-line copyright only. Best for portfolios, photography, luxury.
- centered: Centered logo + links + social + copyright. Best for marketing landing pages.
- magazine: Wide editorial footer with category columns. Best for blogs, news sites.`
}

/**
 * Returns condensed design rules suitable for inclusion in a page-gen system prompt.
 * Focused on actionable rules that affect generated component code quality.
 */
export function getCondensedDesignRules(): string {
  return `### Layout
- Use 12-column grid: max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
- Section padding: py-16 md:py-24 for generous, py-10 md:py-16 for normal, py-6 md:py-10 for compact
- Content width: prose max-w-2xl for text-heavy, max-w-4xl for mixed, full-width for grids
- Responsive breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)

### Typography
- Display text: font-[family-name:var(--font-display)] — ONLY for h1/h2 headings
- Body text: default (no font override needed — body font is set on :root)
- Heading scale: text-4xl md:text-6xl (hero h1), text-3xl md:text-4xl (section h2), text-xl md:text-2xl (card h3)
- Line height: leading-tight for headings, leading-relaxed for body paragraphs
- Letter spacing: tracking-tight for large display text, tracking-normal for body

### Color Usage (semantic classes ONLY)
- Page background: bg-background
- Primary text: text-foreground
- Secondary/muted text: text-muted-foreground
- Primary brand color: bg-primary / text-primary-foreground
- Accent highlights: bg-accent / text-accent-foreground
- Muted sections: bg-muted
- Card backgrounds: bg-card / text-card-foreground
- Borders: border-border
- Destructive actions: bg-destructive / text-destructive-foreground
- NEVER hardcode hex values or use palette-specific Tailwind (bg-blue-500, etc.)

### Cards
- elevated: rounded-[var(--radius)] shadow-md bg-card border-0 hover:shadow-lg transition-shadow
- flat: rounded-[var(--radius)] bg-muted border-0
- glass: rounded-[var(--radius)] bg-card/80 backdrop-blur-sm border border-border/50
- bordered: rounded-[var(--radius)] bg-card border border-border

### Images
- Always include alt text (descriptive, not empty)
- Aspect ratios: aspect-video (16:9), aspect-square, aspect-[4/3], aspect-[3/2]
- Fit: object-cover w-full h-full on all media images
- Lazy load: loading="lazy" on non-hero images

### Interaction & Accessibility
- All interactive elements: min-h-[44px] min-w-[44px] (touch target)
- Focus rings: Tailwind focus-visible:ring-2 focus-visible:ring-primary
- Disabled states: opacity-50 cursor-not-allowed
- Loading states: use skeleton loaders (animate-pulse bg-muted rounded)
- Empty states: centered, muted icon + heading + subtext + optional CTA

### Motion (respect motionPreset)
- none: no transition or animation classes
- subtle: transition-colors duration-200, hover:opacity-90, hover:scale-[1.02]
- expressive: tw-animate-css classes — animate-in fade-in slide-in-from-bottom-4 duration-500

### Data Loading Pattern
\`\`\`tsx
const { data, isLoading, error } = useQuery({ ... })
if (isLoading) return <div className="space-y-4">{Array.from({length:3}).map((_,i)=><div key={i} className="h-32 animate-pulse bg-muted rounded-[var(--radius)]" />)}</div>
if (error) return <div className="text-center py-16 text-muted-foreground">Failed to load data.</div>
if (!data?.length) return <div className="text-center py-16 text-muted-foreground">No items yet.</div>
\`\`\`

### Form Pattern
- Use shadcn/ui Form, FormField, FormItem, FormLabel, FormControl, FormMessage
- Submit button: disabled during mutation, shows loading state
- Validation errors inline under each field via FormMessage`
}

/**
 * Returns condensed design rules for STATIC page generation.
 *
 * Identical to getCondensedDesignRules() but omits the Data Loading Pattern
 * and Form Pattern sections, which reference useQuery, TanStack Query, and
 * Form components not available in the closed vocabulary static prompt.
 *
 * Use this in buildPageGenSystemPrompt() so the prompt contains zero
 * references to Supabase, useQuery, or @tanstack/react-query.
 */
export function getStaticDesignRules(): string {
  return `### Layout
- Use 12-column grid: max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
- Section padding: py-16 md:py-24 for generous, py-10 md:py-16 for normal, py-6 md:py-10 for compact
- Content width: prose max-w-2xl for text-heavy, max-w-4xl for mixed, full-width for grids
- Responsive breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)

### Typography
- Display text: font-[family-name:var(--font-display)] — ONLY for h1/h2 headings
- Body text: default (no font override needed — body font is set on :root)
- Heading scale: text-4xl md:text-6xl (hero h1), text-3xl md:text-4xl (section h2), text-xl md:text-2xl (card h3)
- Line height: leading-tight for headings, leading-relaxed for body paragraphs
- Letter spacing: tracking-tight for large display text, tracking-normal for body

### Color Usage (semantic classes ONLY)
- Page background: bg-background
- Primary text: text-foreground
- Secondary/muted text: text-muted-foreground
- Primary brand color: bg-primary / text-primary-foreground
- Accent highlights: bg-accent / text-accent-foreground
- Muted sections: bg-muted
- Card backgrounds: bg-card / text-card-foreground
- Borders: border-border
- Destructive actions: bg-destructive / text-destructive-foreground
- NEVER hardcode hex values or use palette-specific Tailwind (bg-blue-500, etc.)

### Cards
- elevated: rounded-[var(--radius)] shadow-md bg-card border-0 hover:shadow-lg transition-shadow
- flat: rounded-[var(--radius)] bg-muted border-0
- glass: rounded-[var(--radius)] bg-card/80 backdrop-blur-sm border border-border/50
- bordered: rounded-[var(--radius)] bg-card border border-border

### Images
- Always include alt text (descriptive, not empty)
- Aspect ratios: aspect-video (16:9), aspect-square, aspect-[4/3], aspect-[3/2]
- Fit: object-cover w-full h-full on all media images
- Lazy load: loading="lazy" on non-hero images

### Interaction & Accessibility
- All interactive elements: min-h-[44px] min-w-[44px] (touch target)
- Focus rings: Tailwind focus-visible:ring-2 focus-visible:ring-primary
- Disabled states: opacity-50 cursor-not-allowed
- Empty states: centered, muted icon + heading + subtext + optional CTA

### Motion (respect motionPreset)
- none: no transition or animation classes
- subtle: transition-colors duration-200, hover:opacity-90, hover:scale-[1.02]
- expressive: tw-animate-css classes — animate-in fade-in slide-in-from-bottom-4 duration-500`
}
