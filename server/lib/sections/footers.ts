/**
 * Footer Section Renderers (4)
 *
 * Each renderer is a pure function (SectionContext) => SectionOutput producing
 * a self-contained JSX fragment string. The page assembler composes these into
 * complete route files.
 *
 * Visual taxonomy:
 *   footerDarkPhoto   — hero photo behind black/70 overlay, white text, social icons
 *   footerMinimal     — Separator top, copyright left, social icons + links right
 *   footerMultiColumn — 4-column grid: brand+newsletter, nav, legal, contact+social
 *   footerCentered    — centered stack: name → tagline → links → social → copyright
 *
 * All footers:
 *   - Use <footer aria-label="Site footer"> semantic element
 *   - Wrap nav links in <nav aria-label="Footer navigation">
 *   - Iterate ctx.allEntities.filter(e => !e.isPrivate) for public links
 *   - Append "Sign in" link when ctx.hasAuth is true
 *   - Include © {year} {appName} copyright notice
 *   - shadcn <Separator> replaces manual border-t dividers
 *   - shadcn <Button variant="ghost" size="icon"> wraps social icon anchors
 *   - Lucide Github, Twitter, Linkedin, Instagram icons for social row
 *   - touch targets: min-h-[44px] min-w-[44px] on social buttons (Fitts's Law)
 */

import type { SectionRenderer, SectionOutput, SectionContext, EntityMeta } from './types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build the nav link JSX items for public entities + optional auth link */
function buildNavLinks(ctx: SectionContext, linkClass: string): string {
  const publicEntities = ctx.allEntities.filter((e: EntityMeta) => !e.isPrivate)

  const entityLinks = publicEntities
    .map(
      (e: EntityMeta) =>
        `<Link to="/${e.pluralKebab}" className="${linkClass}">${e.pluralTitle}</Link>`,
    )
    .join('\n              ')

  const authLink = ctx.hasAuth
    ? `\n              <Link to="/auth/login" className="${linkClass}">Sign in</Link>`
    : ''

  return entityLinks + authLink
}

/** Current year expression for copyright — evaluated in JSX at render time */
const COPYRIGHT_EXPR = '{new Date().getFullYear()}'

/**
 * Social icon row JSX — four Ghost/icon Buttons wrapping Lucide icons.
 * Each anchor carries an aria-label; min-h/min-w ensure 44px touch targets
 * per Fitts's Law and WCAG 2.5.8 Target Size guidance.
 *
 * @param rowClass  - className applied to the wrapping <div>
 * @param iconClass - className applied to each Lucide icon element
 */
function socialIconsRow(rowClass: string, iconClass: string): string {
  return `<div className="${rowClass}" role="list" aria-label="Social media links">
              <Button variant="ghost" size="icon" asChild className="min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-ring">
                <a href="#" aria-label="Follow on GitHub" role="listitem">
                  <Github className="${iconClass}" aria-hidden="true" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" asChild className="min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-ring">
                <a href="#" aria-label="Follow on Twitter" role="listitem">
                  <Twitter className="${iconClass}" aria-hidden="true" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" asChild className="min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-ring">
                <a href="#" aria-label="Connect on LinkedIn" role="listitem">
                  <Linkedin className="${iconClass}" aria-hidden="true" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" asChild className="min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-ring">
                <a href="#" aria-label="Follow on Instagram" role="listitem">
                  <Instagram className="${iconClass}" aria-hidden="true" />
                </a>
              </Button>
            </div>`
}

// ---------------------------------------------------------------------------
// Shared import strings — defined once, referenced by each renderer's imports[]
// ---------------------------------------------------------------------------

const IMPORT_LINK = "import { Link } from '@tanstack/react-router'"
const IMPORT_BUTTON = "import { Button } from '@/components/ui/button'"
const IMPORT_SEPARATOR = "import { Separator } from '@/components/ui/separator'"
const IMPORT_INPUT = "import { Input } from '@/components/ui/input'"
const IMPORT_SOCIAL_ICONS =
  "import { Github, Twitter, Linkedin, Instagram } from 'lucide-react'"

// ---------------------------------------------------------------------------
// 1. footerDarkPhoto — hero photo + black/70 overlay, white text, social icons
// ---------------------------------------------------------------------------

export const footerDarkPhoto: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const tagline =
    (ctx.config.tagline as string) || ctx.tokens.textSlots.footer_tagline
  const bgImage =
    ctx.heroImages[1]?.url ?? ctx.heroImages[0]?.url ?? 'https://picsum.photos/1920/400'
  const bgAlt = ctx.heroImages[1]?.alt ?? ctx.heroImages[0]?.alt ?? ''
  const navLinks = buildNavLinks(
    ctx,
    'text-white/70 hover:text-white transition-colors text-sm focus-visible:ring-2 focus-visible:ring-white/60 rounded-sm',
  )
  // Social icons: ghost buttons with white-tinted icon color for the dark overlay
  const socials = socialIconsRow('flex items-center gap-1', 'size-4 text-white/80')

  return {
    jsx: `
      <footer className="relative overflow-hidden" aria-label="Site footer">

        {/* Background photo */}
        <div className="absolute inset-0" aria-hidden="true">
          <img
            src="${bgImage}"
            alt="${bgAlt}"
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/70" role="presentation" />
        </div>

        {/* Content */}
        <div className="relative z-10 container mx-auto px-4 py-16 md:py-20">
          <div className="flex flex-col items-center text-center gap-6">

            {/* Brand */}
            <div>
              <p className="text-2xl font-bold text-white font-[family-name:var(--font-display)]">
                ${ctx.appName}
              </p>
              <p className="mt-2 text-sm text-white/70 max-w-xs leading-relaxed">
                ${tagline}
              </p>
            </div>

            {/* Nav */}
            <nav aria-label="Footer navigation" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              ${navLinks}
            </nav>

            {/* Social icons */}
            ${socials}

            {/* Separator before copyright — Peak-End Rule: polished last impression */}
            <Separator className="bg-white/20 w-full max-w-sm" />

            {/* Copyright */}
            <p className="text-xs text-white/50">
              &copy; ${COPYRIGHT_EXPR} ${ctx.appName}. All rights reserved.
            </p>

          </div>
        </div>

      </footer>`,
    imports: [IMPORT_LINK, IMPORT_BUTTON, IMPORT_SEPARATOR, IMPORT_SOCIAL_ICONS],
  }
}

// ---------------------------------------------------------------------------
// 2. footerMinimal — Separator at top, copyright left, social icons + links right
// ---------------------------------------------------------------------------

export const footerMinimal: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const navLinks = buildNavLinks(
    ctx,
    'text-muted-foreground hover:text-foreground transition-colors text-sm focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
  )
  const socials = socialIconsRow(
    'flex items-center gap-0.5',
    'size-4 text-muted-foreground',
  )

  return {
    jsx: `
      <footer className="bg-background" aria-label="Site footer">
        {/* shadcn Separator replaces manual border-t */}
        <Separator />
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

            {/* Copyright */}
            <p className="text-sm text-muted-foreground">
              &copy; ${COPYRIGHT_EXPR} ${ctx.appName}. All rights reserved.
            </p>

            {/* Right side — social icons, vertical divider, nav links */}
            <div className="flex flex-wrap items-center gap-2">
              ${socials}
              <Separator orientation="vertical" className="h-5 hidden sm:block" />
              <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-2">
                ${navLinks}
              </nav>
            </div>

          </div>
        </div>
      </footer>`,
    imports: [IMPORT_LINK, IMPORT_BUTTON, IMPORT_SEPARATOR, IMPORT_SOCIAL_ICONS],
  }
}

// ---------------------------------------------------------------------------
// 3. footerMultiColumn — 4-column grid: brand+newsletter, nav, legal, contact+social
// ---------------------------------------------------------------------------

export const footerMultiColumn: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const tagline =
    (ctx.config.tagline as string) || ctx.tokens.textSlots.footer_tagline
  const contactEmail = (ctx.config.email as string) || ''
  const radius = ctx.tokens.style.borderRadius
  const navLinks = buildNavLinks(
    ctx,
    'text-muted-foreground hover:text-foreground transition-colors text-sm focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
  )
  const socials = socialIconsRow(
    'flex items-center gap-0.5 mt-2',
    'size-4 text-muted-foreground',
  )

  return {
    jsx: `
      <footer className="bg-background" aria-label="Site footer">
        <div className="container mx-auto px-4 pt-12 md:pt-16 pb-0">

          {/* 4-column grid — stacks to 1 col on mobile, 2 cols on sm */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 mb-10">

            {/* Col 1 — Brand + Newsletter */}
            <div className="sm:col-span-2 md:col-span-1">
              <p className="text-base font-bold text-foreground font-[family-name:var(--font-display)] mb-2">
                ${ctx.appName}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px] mb-5">
                ${tagline}
              </p>

              {/* Newsletter signup */}
              <form
                onSubmit={e => e.preventDefault()}
                aria-label="Newsletter signup"
                className="flex flex-col gap-2"
              >
                <label
                  htmlFor="footer-newsletter-email"
                  className="text-xs font-semibold uppercase tracking-wider text-foreground"
                >
                  Stay updated
                </label>
                <div className="flex gap-2">
                  <Input
                    id="footer-newsletter-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    aria-label="Email address for newsletter"
                    className="flex-1 text-sm rounded-[${radius}] focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="shrink-0 rounded-[${radius}] focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Subscribe to newsletter"
                  >
                    Subscribe
                  </Button>
                </div>
              </form>
            </div>

            {/* Col 2 — Navigation */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-4">
                Explore
              </h3>
              <nav aria-label="Footer navigation" className="flex flex-col gap-2.5">
                ${navLinks}
              </nav>
            </div>

            {/* Col 3 — Legal */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-4">
                Legal
              </h3>
              <ul className="flex flex-col gap-2.5" role="list">
                <li>
                  <a
                    href="/privacy"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors rounded-[${radius}] focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a
                    href="/terms"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors rounded-[${radius}] focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 4 — Contact + Social */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-4">
                Contact
              </h3>
              <ul className="flex flex-col gap-2.5" role="list">
                ${
                  contactEmail
                    ? `<li>
                  <a
                    href="mailto:${contactEmail}"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    ${contactEmail}
                  </a>
                </li>`
                    : `<li className="text-sm text-muted-foreground">
                  Get in touch with us
                </li>`
                }
              </ul>
              {/* Social icons below contact info */}
              ${socials}
            </div>

          </div>

          {/* Bottom bar — shadcn Separator + copyright */}
          <Separator />
          <div className="py-6">
            <p className="text-xs text-muted-foreground text-center md:text-left">
              &copy; ${COPYRIGHT_EXPR} ${ctx.appName}. All rights reserved.
            </p>
          </div>

        </div>
      </footer>`,
    imports: [IMPORT_LINK, IMPORT_BUTTON, IMPORT_INPUT, IMPORT_SEPARATOR, IMPORT_SOCIAL_ICONS],
  }
}

// ---------------------------------------------------------------------------
// 4. footerCentered — centered stack: name → tagline → nav → social → copyright
// ---------------------------------------------------------------------------

export const footerCentered: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const tagline =
    (ctx.config.tagline as string) || ctx.tokens.textSlots.footer_tagline
  const navLinks = buildNavLinks(
    ctx,
    'text-muted-foreground hover:text-foreground transition-colors text-sm focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
  )
  const socials = socialIconsRow(
    'flex items-center justify-center gap-1',
    'size-4 text-muted-foreground',
  )

  return {
    jsx: `
      <footer
        className="bg-muted/30 text-center"
        aria-label="Site footer"
      >
        {/* shadcn Separator at top — replaces border-t */}
        <Separator />
        <div className="container mx-auto px-4 py-12 md:py-16 flex flex-col items-center gap-5">

          {/* App name */}
          <p className="text-lg font-bold text-foreground font-[family-name:var(--font-display)]">
            ${ctx.appName}
          </p>

          {/* Tagline */}
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            ${tagline}
          </p>

          {/* Nav links */}
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap justify-center gap-x-6 gap-y-2"
          >
            ${navLinks}
          </nav>

          {/* Social icons row — between links and copyright (Peak-End Rule) */}
          ${socials}

          {/* Short Separator + copyright */}
          <Separator className="w-24 mx-auto" />
          <p className="text-xs text-muted-foreground">
            &copy; ${COPYRIGHT_EXPR} ${ctx.appName}. All rights reserved.
          </p>

        </div>
      </footer>`,
    imports: [IMPORT_LINK, IMPORT_BUTTON, IMPORT_SEPARATOR, IMPORT_SOCIAL_ICONS],
  }
}
