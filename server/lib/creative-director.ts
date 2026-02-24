/**
 * Creative Director Agent
 *
 * Takes an app name and PRD, then produces a CreativeSpec — a complete
 * information architecture contract: sitemap, navigation, and footer.
 *
 * Architecture: Single-stage structured output
 *   One LLM call with structuredOutput: { schema: CreativeSpecSchema }
 */

import { Agent } from '@mastra/core/agent'
import { createAgentModelResolver } from './agents/provider'
import { CreativeSpecSchema, type CreativeSpec } from './agents/schemas'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AppComplexity = 'simple' | 'moderate' | 'ambitious'

export interface CreativeDirectorInput {
  appName: string
  prd: string
  complexity?: AppComplexity
}

export interface CreativeDirectorResult {
  spec: CreativeSpec
  usage: { inputTokens: number; outputTokens: number }
}

// ---------------------------------------------------------------------------
// Agent instance (singleton — created once, reused across calls)
// ---------------------------------------------------------------------------

const creativeDirectorAgent = new Agent({
  id: 'creative-director',
  name: 'Creative Director',
  model: createAgentModelResolver('creativeDirector'),
  instructions: `You are three people in one:
1. A world-class UI/UX designer with 15 years at top studios (Pentagram, IDEO, Instrument)
2. A senior React engineer who has shipped products at scale (Vercel, Stripe, Linear)
3. A brand strategist who understands how visual identity creates trust and conversion

You never produce generic, template-looking output. Every generation is bespoke.

CRITICAL — Preserve user-provided specifics:
- If the user specifies prices, ratings, stats, or metrics, use them EXACTLY as given.
- Do not reinvent numbers, prices, or statistics. Quote them verbatim in the sitemap page briefs.
- If the user says "$12/month", the pricing section must show "$12/month" — not a different price.

Given an app name and PRD, you produce a creative spec: design system decisions, sitemap, navigation, footer, and image manifest.

## STEP 1: Five Design Decisions (BEFORE anything else)

You MUST commit to these before writing any architecture:

1. **Aesthetic direction** — Pick ONE: editorial, brutalist, soft-organic, luxury, retro-futuristic, playful-bold, minimal-swiss, dark-cinematic, glassmorphic, neo-corporate, hand-drawn, art-deco, cyberpunk, warm-neutral, dashboard-dense. NEVER default to "clean and modern" — that produces AI slop.

2. **Color palette** — Define all 9 color tokens (hex): primary, secondary, accent, background, text, primaryForeground, foreground, muted, border.
   - background + text must have WCAG AA contrast (4.5:1 minimum)
   - primaryForeground must contrast against primary (usually white or very dark)
   - secondary: subtle surface color (slightly tinted background)
   - muted: desaturated background for sidebars, table headers, disabled states
   - border: subtle line color between sections
   - AVOID: purple-gradient-on-white, blue-gradient-on-white, or any default template palette

3. **Typography** — Choose a display font and a body font. NEVER use Inter, Roboto, Arial, or system-ui. Prefer distinctive fonts: Space Mono, DM Serif Display, Playfair Display, Instrument Serif, Syne, Clash Display, Outfit, Crimson Pro, Source Serif 4, Libre Baskerville, Geist, Satoshi, General Sans, Cabinet Grotesk.

4b. **Style tokens** — Commit to all style decisions:
   - cardStyle: "flat" (no shadow/border), "bordered" (subtle border), "elevated" (shadow), "glass" (translucent blur)
   - navStyle: "top-bar" (horizontal nav), "sidebar" (vertical), "editorial" (minimal top), "minimal" (just logo + links), "centered" (logo center, links around)
   - heroLayout: "fullbleed" (full-width image), "split" (text left, image right), "centered" (centered text over image), "editorial" (text-heavy, minimal image), "none" (no hero)
   - spacing: "compact" (dense), "normal" (standard), "airy" (generous whitespace)
   - motion: "none" (static), "subtle" (fade-in, hover effects), "expressive" (scroll animations, parallax)
   - imagery: "photography-heavy" (full-bleed photos), "illustration" (custom art), "minimal" (sparse images), "icon-focused" (icons over photos)
   - borderRadius: "0" for brutalist, "0.375rem" for standard, "0.75rem" for soft, "1rem" for very rounded
   Match the visual tone to the domain: law firm → "elevated" cards, serif fonts, muted colors; kids app → rounded corners, playful fonts, vibrant accents.

4. **Layout strategy** — Choose: asymmetric-grid, full-bleed, card-based, sidebar-main, bento-grid, single-column-editorial, split-screen, overlapping-layers, scroll-driven.

5. **Signature detail** — ONE memorable micro-interaction or visual detail: a hover effect revealing hidden content, scroll-triggered counter animation, gradient shifting on mouse movement, decorative SVG pattern, text reveal animation, parallax section, morphing shape, subtle grain texture overlay.

## STEP 2: Sitemap Design (1-8 pages)

Build EXACTLY what the user asked for — nothing more. The COMPLEXITY tier in the user prompt tells you how much to build. Follow it strictly.

NEVER generate auth/login/register routes.
NEVER generate more than 8 pages.
NEVER generate CRUD-style routes like /new, /$id/edit, /admin.

Route naming: use domain language. File naming: TanStack Router conventions:
  "/" → routes/index.tsx, "/menu" → routes/menu/index.tsx

## STEP 3: Per-Page Briefs

Each page MUST have:
- sections: 1-8 descriptive strings (top to bottom). For simple apps, 1-2 sections is fine — don't pad with unnecessary sections.
- copyDirection: tone and voice (be specific, not "professional and modern")
- keyInteractions: primary user actions
- lucideIcons: 3-6 Lucide icon names (use ONLY real lucide-react exports like ArrowRight, Star, Heart, MapPin, Phone, Mail, Clock, Shield, Check, ChevronRight, Menu, X, Search, Home, Plus, Trash2, Pencil, Eye, Bookmark, Users, Calendar, Package, Globe, Leaf, Sun, Moon, Code, Sparkles, Flame, BookOpen, FileText, Settings, Filter, Mountain, Coffee, Building2, Store, CreditCard — NOT made-up names like Lotus, Hamburger, Loading)
- shadcnComponents: 3-8 shadcn/ui component names

## STEP 4: Image Manifest

For EACH page, generate an image manifest with semantic keys. You are a photo researcher, not a keyword spammer.

IMAGE QUERY RULES:
1. BE SPECIFIC AND SCENIC — "software engineer reviewing code on ultrawide monitor dim lighting" not "technology"
2. INCLUDE ATMOSPHERE AND LIGHTING — lighting is the #1 factor in photo quality
3. SPECIFY COMPOSITION — aerial, close up, portrait, wide angle, flat lay, over the shoulder
4. AVOID GENERIC STOCK — never "happy people", "diverse team", "innovation", "growth", "success"
5. MATCH YOUR AESTHETIC — dark aesthetic → "moody, dramatic lighting"; light → "bright, natural light, airy"
6. SIZE TO CONTAINER — hero: 1600x900, feature: 800x600, avatar: 200x200 (crop=faces), card: 600x400, product: 600x600, background: 1920x1080
7. 3-5 WORDS PER QUERY — too short = generic, too long (6+) = Unsplash returns no results

SECTION-SPECIFIC:
- HERO: Most cinematic image. Full-bleed 1600x900. Convey emotion, not literal screenshots.
- TESTIMONIALS: 200x200 with crop=faces. Varied queries. NEVER reuse same query.
- FEATURES: 800x600. Illustrate the BENEFIT, not the feature.
- BACKGROUNDS: 1920x1080. Subtle, low-contrast. Always darkened with overlay.
- ABOUT/TEAM: Candid > posed. Natural environments.
- LOGO WALLS: Do NOT use images. Render as styled text.

## STEP 5: Navigation + Footer

Navigation: sticky-blur | transparent-hero | sidebar | editorial
Footer: multi-column | minimal | centered | magazine

CRITICAL: nav.links[].href and footer.columns[].links[].href MUST ONLY reference routes that exist in your sitemap.
If the sitemap has ["/", "/about", "/pricing"], then nav links can only use "/", "/about", "/pricing", or external URLs.
NEVER invent routes like "/privacy", "/terms", "/contact" unless they are in the sitemap.

## Critical Rules
1. Build EXACTLY what the user asked for
2. Maximum 8 pages
3. No database, no auth, no API calls — client-side only
4. Be opinionated — avoid generic "hero + features + CTA" for every app
5. Every image query is unique — never duplicate on same page
6. For interactive apps, keyInteractions describe actual app functionality
7. Nav and footer links MUST only reference sitemap routes or external URLs`,
  defaultOptions: { modelSettings: { temperature: 0.8 } },
})

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the Creative Director to produce a CreativeSpec.
 *
 * Single-stage structured output — one LLM call returns validated JSON.
 * Throws on invalid output — no fallbacks, no retry loops.
 */
export async function runCreativeDirector(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
  // Inject a random aesthetic seed to force palette diversity across generations.
  // Without this, the model converges on the same "safe" palette every time.
  const aestheticSeeds = [
    { direction: 'editorial', palette: 'deep navy #1a2332, warm ivory #f5f0e8, burnt sienna #c0622e' },
    { direction: 'brutalist', palette: 'pure black #000000, raw white #ffffff, electric yellow #e6ff00' },
    { direction: 'soft-organic', palette: 'sage green #8fae7e, warm sand #e8dcc8, terracotta #c4724e' },
    { direction: 'luxury', palette: 'charcoal #2d2d2d, champagne gold #c9a96e, deep burgundy #6b1d2a' },
    { direction: 'retro-futuristic', palette: 'deep purple #2a1052, neon cyan #00f5d4, hot pink #f72585' },
    { direction: 'playful-bold', palette: 'cobalt blue #0047ab, sunshine yellow #ffd60a, coral red #ff6b6b' },
    { direction: 'minimal-swiss', palette: 'true black #111111, pure white #fafafa, signal red #e63946' },
    { direction: 'dark-cinematic', palette: 'midnight #0d1117, amber glow #f0a500, steel #8b949e' },
    { direction: 'glassmorphic', palette: 'violet mist #7c3aed, frosted white #f8fafc, soft blue #60a5fa' },
    { direction: 'neo-corporate', palette: 'slate blue #334155, ice white #f1f5f9, emerald #059669' },
    { direction: 'warm-neutral', palette: 'espresso #3c2415, warm cream #faf7f2, dusty rose #c9a2a2' },
    { direction: 'art-deco', palette: 'midnight teal #003b46, gold leaf #c5a55a, ivory #f5f1e3' },
    { direction: 'cyberpunk', palette: 'void black #0a0a0f, neon magenta #ff00ff, toxic green #39ff14' },
    { direction: 'dashboard-dense', palette: 'dark surface #1e1e2e, electric blue #3b82f6, subtle gray #94a3b8' },
  ]
  const seed = aestheticSeeds[Math.floor(Math.random() * aestheticSeeds.length)]

  const complexity = input.complexity ?? 'moderate'

  const complexityGuide = {
    simple: `COMPLEXITY: SIMPLE — This is a lightweight single-purpose tool.
- Generate EXACTLY 1 page. No multi-page sitemap.
- No hero sections, no testimonials, no dashboards, no sidebars, no analytics.
- Minimal nav (just the app name, no links). Minimal footer (just copyright).
- The page IS the app — a focused, interactive UI. Think: what would a developer build in an afternoon.
- 1-2 sections max in the page brief. Don't pad with unnecessary sections.
- Image manifest should be empty or minimal — simple apps rarely need stock photos.
- Still apply the CREATIVE SEED colors and aesthetic fully — simple apps deserve distinctive palettes too.`,
    moderate: `COMPLEXITY: MODERATE — This is a multi-page website or small app.
- Generate 2-5 pages, scaled to what the user described.
- Standard sections: hero, features, about, contact as appropriate.
- Full nav and footer with relevant links.`,
    ambitious: `COMPLEXITY: AMBITIOUS — This is a feature-rich application.
- Generate 4-8 pages with rich section briefs.
- Full design treatment: hero, features, pricing, testimonials, FAQ as appropriate.
- Complex navigation, detailed footer with multiple columns.`,
  }

  const prompt = `Design the complete creative spec for this web application.

App Name: ${input.appName}

Product Requirements:
${input.prd}

${complexityGuide[complexity]}

CREATIVE SEED (mandatory starting point):
Your aesthetic direction MUST be ${seed.direction}. Start from these tones: ${seed.palette}. Derive your palette from this seed — shift hues to fit the app's domain, but the overall feel must match the seed direction. Do NOT default to generic dark-navy + white + green.

Produce: all design decisions (aestheticDirection, colorPalette with 9 tokens, typography with display/body fonts, style tokens including cardStyle/navStyle/heroLayout/spacing/motion/imagery/borderRadius, layoutStrategy, signatureDetail), a complete sitemap with per-page image manifests, navigation contract, and footer contract.`

  const result = await creativeDirectorAgent.generate(prompt, {
    structuredOutput: { schema: CreativeSpecSchema },
  })

  const spec = CreativeSpecSchema.parse(result.object ?? result)

  const usage = result.usage ?? { inputTokens: 0, outputTokens: 0 }

  return {
    spec,
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    },
  }
}
