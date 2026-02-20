/**
 * Footer Section Renderers (4)
 *
 * Each renderer is a pure function (SectionContext) => SectionOutput producing
 * a self-contained JSX fragment string. The page assembler composes these into
 * complete route files.
 *
 * Visual taxonomy:
 *   footerDarkPhoto   — hero photo behind black/70 overlay, white text
 *   footerMinimal     — single border-top row: copyright left, links right
 *   footerMultiColumn — 4-column grid: brand, nav, legal, contact
 *   footerCentered    — centered stack: name → tagline → links → copyright
 *
 * All footers:
 *   - Use <footer> semantic element
 *   - Wrap nav links in <nav aria-label="Footer navigation">
 *   - Iterate ctx.allEntities.filter(e => !e.isPrivate) for public links
 *   - Append "Sign in" link when ctx.hasAuth is true
 *   - Include © {year} {appName} copyright notice
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

// ---------------------------------------------------------------------------
// 1. footerDarkPhoto — hero photo + black/70 overlay, white text
// ---------------------------------------------------------------------------

export const footerDarkPhoto: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const tagline =
    (ctx.config.tagline as string) || ctx.tokens.textSlots.footer_tagline
  const bgImage =
    ctx.heroImages[1]?.url ?? ctx.heroImages[0]?.url ?? 'https://picsum.photos/1920/400'
  const bgAlt = ctx.heroImages[1]?.alt ?? ctx.heroImages[0]?.alt ?? ''
  const navLinks = buildNavLinks(ctx, 'text-white/70 hover:text-white transition-colors text-sm')

  return {
    jsx: `
      <footer className="relative overflow-hidden" aria-label="Site footer">

        {/* Background photo */}
        <div className="absolute inset-0" aria-hidden="true">
          <img
            src="${bgImage}"
            alt="${bgAlt}"
            className="h-full w-full object-cover"
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

            {/* Copyright */}
            <p className="text-xs text-white/50">
              &copy; ${COPYRIGHT_EXPR} ${ctx.appName}. All rights reserved.
            </p>

          </div>
        </div>

      </footer>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
  }
}

// ---------------------------------------------------------------------------
// 2. footerMinimal — single border-top row, copyright left, links right
// ---------------------------------------------------------------------------

export const footerMinimal: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const navLinks = buildNavLinks(
    ctx,
    'text-muted-foreground hover:text-foreground transition-colors text-sm',
  )

  return {
    jsx: `
      <footer className="border-t border-border bg-background py-8" aria-label="Site footer">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

            {/* Copyright */}
            <p className="text-sm text-muted-foreground">
              &copy; ${COPYRIGHT_EXPR} ${ctx.appName}. All rights reserved.
            </p>

            {/* Nav links */}
            <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-2">
              ${navLinks}
            </nav>

          </div>
        </div>
      </footer>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
  }
}

// ---------------------------------------------------------------------------
// 3. footerMultiColumn — 4-column grid: brand, nav, legal, contact/social
// ---------------------------------------------------------------------------

export const footerMultiColumn: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const tagline =
    (ctx.config.tagline as string) || ctx.tokens.textSlots.footer_tagline
  const contactEmail = (ctx.config.email as string) || ''
  const radius = ctx.tokens.style.borderRadius
  const navLinks = buildNavLinks(
    ctx,
    'text-muted-foreground hover:text-foreground transition-colors text-sm',
  )

  return {
    jsx: `
      <footer className="border-t border-border bg-background" aria-label="Site footer">
        <div className="container mx-auto px-4 py-12 md:py-16">

          {/* Columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 mb-10">

            {/* Col 1 — Brand */}
            <div className="col-span-2 md:col-span-1">
              <p className="text-base font-bold text-foreground font-[family-name:var(--font-display)] mb-2">
                ${ctx.appName}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px]">
                ${tagline}
              </p>
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
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors rounded-[${radius}]"
                  >
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a
                    href="/terms"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors rounded-[${radius}]"
                  >
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 4 — Contact / Social */}
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
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ${contactEmail}
                  </a>
                </li>`
                    : `<li className="text-sm text-muted-foreground">
                  Get in touch with us
                </li>`
                }
              </ul>
            </div>

          </div>

          {/* Bottom bar */}
          <div className="border-t border-border pt-6">
            <p className="text-xs text-muted-foreground text-center md:text-left">
              &copy; ${COPYRIGHT_EXPR} ${ctx.appName}. All rights reserved.
            </p>
          </div>

        </div>
      </footer>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
  }
}

// ---------------------------------------------------------------------------
// 4. footerCentered — centered stack: name → tagline → nav → copyright
// ---------------------------------------------------------------------------

export const footerCentered: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const tagline =
    (ctx.config.tagline as string) || ctx.tokens.textSlots.footer_tagline
  const navLinks = buildNavLinks(
    ctx,
    'text-muted-foreground hover:text-foreground transition-colors text-sm',
  )

  return {
    jsx: `
      <footer
        className="border-t border-border bg-muted/30 text-center"
        aria-label="Site footer"
      >
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

          {/* Copyright */}
          <p className="text-xs text-muted-foreground">
            &copy; ${COPYRIGHT_EXPR} ${ctx.appName}. All rights reserved.
          </p>

        </div>
      </footer>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
  }
}
