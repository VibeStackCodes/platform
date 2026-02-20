/**
 * Navigation Section Renderers (4)
 *
 * Each renderer is a pure function (SectionContext) => SectionOutput producing
 * a self-contained JSX fragment string. The page assembler composes these into
 * complete route files.
 *
 * Visual taxonomy:
 *   navTopbar    — sticky horizontal top bar, hamburger on mobile
 *   navSidebar   — fixed left sidebar, collapsible on mobile
 *   navEditorial — minimal transparent editorial bar, magazine-style
 *   navMega      — top bar with full-width mega-menu dropdown on hover
 */

import type { SectionRenderer, SectionOutput, SectionContext } from './types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build nav link objects for all public entities */
function publicNavLinks(ctx: SectionContext): Array<{ label: string; path: string }> {
  return ctx.allEntities
    .filter((e) => !e.isPrivate)
    .map((e) => ({ label: e.pluralTitle, path: e.pluralKebab }))
}

/** Entrance animation class when motion is enabled */
function entranceClass(ctx: SectionContext): string {
  return ctx.tokens.style.motion !== 'none' ? 'transition-all duration-300 ease-out' : ''
}

// ---------------------------------------------------------------------------
// 1. navTopbar — sticky horizontal top bar, logo left, links center, auth right
// ---------------------------------------------------------------------------

export const navTopbar: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const links = publicNavLinks(ctx)
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)

  const linkItems = links
    .map(
      (l) =>
        `              <li>
                <Link
                  to="/${l.path}"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm px-1"
                >
                  ${l.label}
                </Link>
              </li>`,
    )
    .join('\n')

  const mobileLinks = links
    .map(
      (l) =>
        `              <li>
                <Link
                  to="/${l.path}"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full py-2 px-4 text-sm font-medium text-foreground hover:bg-muted rounded-[${radius}] ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  ${l.label}
                </Link>
              </li>`,
    )
    .join('\n')

  const authButton = ctx.hasAuth
    ? `
              <Link
                to="/auth/login"
                className="inline-flex items-center px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-[${radius}] hover:opacity-90 ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Sign In
              </Link>`
    : ''

  return {
    jsx: `
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border" role="banner">
        {/* Skip to main content for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-[${radius}] focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>

        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-6">

          {/* Logo / App name */}
          <Link
            to="/"
            className="flex-shrink-0 text-lg font-bold text-foreground font-[family-name:var(--font-display)] hover:opacity-80 ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
            aria-label="${ctx.appName} — home"
          >
            ${ctx.appName}
          </Link>

          {/* Center nav links — hidden on mobile */}
          <nav className="hidden md:flex flex-1 justify-center" aria-label="Main navigation">
            <ul className="flex items-center gap-6 list-none m-0 p-0">
${linkItems}
            </ul>
          </nav>

          {/* Right side — auth + mobile toggle */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center">
${authButton}
            </div>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-[${radius}] text-muted-foreground hover:bg-muted hover:text-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <nav
            id="mobile-menu"
            className="md:hidden border-t border-border bg-background"
            aria-label="Mobile navigation"
          >
            <ul className="flex flex-col list-none m-0 p-0 py-2">
${mobileLinks}
              {${ctx.hasAuth} && (
                <li className="px-3 pt-2 pb-1 border-t border-border mt-2">
                  <Link
                    to="/auth/login"
                    onClick={() => setMobileOpen(false)}
                    className="block w-full py-2 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-[${radius}] text-center ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Sign In
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        )}
      </header>`,
    imports: [
      "import { useState } from 'react'",
      "import { Link } from '@tanstack/react-router'",
    ],
    hooks: ['const [mobileOpen, setMobileOpen] = useState(false)'],
  }
}

// ---------------------------------------------------------------------------
// 2. navSidebar — fixed left sidebar w-64, collapsible on mobile
// ---------------------------------------------------------------------------

export const navSidebar: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const links = publicNavLinks(ctx)
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)

  const linkItems = links
    .map(
      (l) =>
        `              <li>
                <Link
                  to="/${l.path}"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-[${radius}] ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" aria-hidden="true" />
                  ${l.label}
                </Link>
              </li>`,
    )
    .join('\n')

  const authSection = ctx.hasAuth
    ? `
            {/* Auth */}
            <div className="border-t border-border pt-4 mt-4">
              <Link
                to="/auth/login"
                className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-[${radius}] hover:opacity-90 ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Sign In
              </Link>
            </div>`
    : ''

  return {
    jsx: `
      <>
        {/* Skip to main content for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-[${radius}] focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>

        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile toggle button */}
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="fixed top-4 left-4 z-50 md:hidden inline-flex items-center justify-center w-9 h-9 bg-card border border-border rounded-[${radius}] text-foreground shadow-sm ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-expanded={sidebarOpen}
          aria-controls="sidebar-nav"
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {sidebarOpen ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>

        {/* Sidebar */}
        <aside
          id="sidebar-nav"
          className={\`fixed top-0 left-0 z-40 h-screen w-64 bg-card border-r border-border flex flex-col
            ${motion} transform
            md:translate-x-0
            \${sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0'}\`}
          aria-label="Sidebar navigation"
        >
          {/* App name / logo */}
          <div className="flex items-center h-16 px-4 border-b border-border flex-shrink-0">
            <Link
              to="/"
              className="text-lg font-bold text-foreground font-[family-name:var(--font-display)] hover:opacity-80 ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
              aria-label="${ctx.appName} — home"
            >
              ${ctx.appName}
            </Link>
          </div>

          {/* Nav links — scrollable */}
          <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="Sidebar links">
            <ul className="flex flex-col gap-1 list-none m-0 p-0">
${linkItems}
            </ul>
          </nav>

          {/* Bottom auth area */}
          <div className="px-3 pb-4">
${authSection}
          </div>
        </aside>
      </>`,
    imports: [
      "import { useState } from 'react'",
      "import { Link } from '@tanstack/react-router'",
    ],
    hooks: ['const [sidebarOpen, setSidebarOpen] = useState(false)'],
  }
}

// ---------------------------------------------------------------------------
// 3. navEditorial — minimal transparent editorial bar, magazine serif logo
// ---------------------------------------------------------------------------

export const navEditorial: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const links = publicNavLinks(ctx).slice(0, 3) // editorial: keep it sparse
  const motion = entranceClass(ctx)
  const radius = ctx.tokens.style.borderRadius

  const linkItems = links
    .map(
      (l) =>
        `            <li>
              <Link
                to="/${l.path}"
                className="text-xs font-semibold tracking-[0.1em] uppercase text-muted-foreground hover:text-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm px-1"
              >
                ${l.label}
              </Link>
            </li>`,
    )
    .join('\n')

  const mobileLinks = links
    .map(
      (l) =>
        `              <li>
                <Link
                  to="/${l.path}"
                  onClick={() => setEditorialOpen(false)}
                  className="block py-2 text-sm font-semibold tracking-wide uppercase text-foreground hover:text-muted-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  ${l.label}
                </Link>
              </li>`,
    )
    .join('\n')

  const authLink = ctx.hasAuth
    ? `
            <li>
              <Link
                to="/auth/login"
                className="text-xs font-semibold tracking-[0.1em] uppercase text-foreground border border-foreground/30 px-3 py-1 hover:border-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
              >
                Sign In
              </Link>
            </li>`
    : ''

  return {
    jsx: `
      <header className="border-b border-border/50 bg-transparent" role="banner">
        {/* Skip to main content for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-foreground focus:text-background focus:text-sm focus:font-medium focus:rounded-sm"
        >
          Skip to content
        </a>

        <div className="container mx-auto px-6 h-14 flex items-center justify-between gap-8">

          {/* Serif logo */}
          <Link
            to="/"
            className="flex-shrink-0 text-xl font-bold italic text-foreground font-[family-name:var(--font-display)] hover:opacity-70 ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm tracking-tight"
            aria-label="${ctx.appName} — home"
          >
            ${ctx.appName}
          </Link>

          {/* Right side — links + auth */}
          <nav className="hidden md:flex items-center" aria-label="Editorial navigation">
            <ul className="flex items-center gap-6 list-none m-0 p-0">
${linkItems}
${authLink}
            </ul>
          </nav>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setEditorialOpen((o) => !o)}
            className="md:hidden inline-flex items-center justify-center w-8 h-8 text-foreground hover:opacity-70 ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
            aria-expanded={editorialOpen}
            aria-controls="editorial-menu"
            aria-label={editorialOpen ? 'Close menu' : 'Open menu'}
          >
            {editorialOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h16M4 12h10M4 17h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile drawer */}
        {editorialOpen && (
          <nav
            id="editorial-menu"
            className="md:hidden border-t border-border/50 px-6 py-4"
            aria-label="Mobile editorial navigation"
          >
            <ul className="flex flex-col gap-3 list-none m-0 p-0">
${mobileLinks}
              {${ctx.hasAuth} && (
                <li className="pt-2 border-t border-border/50">
                  <Link
                    to="/auth/login"
                    onClick={() => setEditorialOpen(false)}
                    className="block py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:text-muted-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-[${radius}]"
                  >
                    Sign In
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        )}
      </header>`,
    imports: [
      "import { useState } from 'react'",
      "import { Link } from '@tanstack/react-router'",
    ],
    hooks: ['const [editorialOpen, setEditorialOpen] = useState(false)'],
  }
}

// ---------------------------------------------------------------------------
// 4. navMega — top bar with full-width mega-menu dropdown on hover
// ---------------------------------------------------------------------------

export const navMega: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const links = publicNavLinks(ctx)
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)

  // Build dropdown link columns (group in pairs for layout)
  const dropdownLinks = links
    .map(
      (l) =>
        `                  <li>
                    <Link
                      to="/${l.path}"
                      onClick={() => setActiveMenu(null)}
                      className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-[${radius}] ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      ${l.label}
                    </Link>
                  </li>`,
    )
    .join('\n')

  const topbarLinks = links
    .map(
      (l) =>
        `              <li>
                <button
                  type="button"
                  onMouseEnter={() => setActiveMenu('${l.path}')}
                  onFocus={() => setActiveMenu('${l.path}')}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm px-2 py-1 flex items-center gap-1"
                  aria-expanded={activeMenu === '${l.path}'}
                  aria-haspopup="true"
                >
                  ${l.label}
                  <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </li>`,
    )
    .join('\n')

  const mobileLinks = links
    .map(
      (l) =>
        `              <li>
                <Link
                  to="/${l.path}"
                  onClick={() => setMegaMobileOpen(false)}
                  className="block w-full py-2 px-4 text-sm font-medium text-foreground hover:bg-muted rounded-[${radius}] ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  ${l.label}
                </Link>
              </li>`,
    )
    .join('\n')

  const authButton = ctx.hasAuth
    ? `
              <Link
                to="/auth/login"
                className="inline-flex items-center px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-[${radius}] hover:opacity-90 ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Sign In
              </Link>`
    : ''

  return {
    jsx: `
      <header
        className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border"
        role="banner"
        onMouseLeave={() => setActiveMenu(null)}
      >
        {/* Skip to main content for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-[${radius}] focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>

        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-6">

          {/* Logo */}
          <Link
            to="/"
            className="flex-shrink-0 text-lg font-bold text-foreground font-[family-name:var(--font-display)] hover:opacity-80 ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
            aria-label="${ctx.appName} — home"
          >
            ${ctx.appName}
          </Link>

          {/* Category nav buttons — desktop */}
          <nav className="hidden md:flex flex-1 justify-center" aria-label="Main navigation">
            <ul className="flex items-center gap-2 list-none m-0 p-0">
${topbarLinks}
            </ul>
          </nav>

          {/* Auth + mobile toggle */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center">
${authButton}
            </div>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMegaMobileOpen((o) => !o)}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-[${radius}] text-muted-foreground hover:bg-muted hover:text-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-expanded={megaMobileOpen}
              aria-controls="mega-mobile-menu"
              aria-label={megaMobileOpen ? 'Close menu' : 'Open menu'}
            >
              {megaMobileOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mega dropdown panel — desktop only */}
        {activeMenu !== null && (
          <div
            className="hidden md:block absolute left-0 w-full bg-card border-b border-border shadow-lg z-40"
            role="region"
            aria-label="Navigation dropdown"
            onMouseEnter={() => setActiveMenu(activeMenu)}
          >
            <div className="container mx-auto px-4 py-6">
              <ul className="grid grid-cols-3 md:grid-cols-4 gap-1 list-none m-0 p-0">
${dropdownLinks}
              </ul>
            </div>
          </div>
        )}

        {/* Mobile drawer */}
        {megaMobileOpen && (
          <nav
            id="mega-mobile-menu"
            className="md:hidden border-t border-border bg-background"
            aria-label="Mobile navigation"
          >
            <ul className="flex flex-col list-none m-0 p-0 py-2">
${mobileLinks}
              {${ctx.hasAuth} && (
                <li className="px-3 pt-2 pb-1 border-t border-border mt-2">
                  <Link
                    to="/auth/login"
                    onClick={() => setMegaMobileOpen(false)}
                    className="block w-full py-2 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-[${radius}] text-center ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Sign In
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        )}
      </header>`,
    imports: [
      "import { useState } from 'react'",
      "import { Link } from '@tanstack/react-router'",
    ],
    hooks: [
      'const [activeMenu, setActiveMenu] = useState<string | null>(null)',
      'const [megaMobileOpen, setMegaMobileOpen] = useState(false)',
    ],
  }
}
