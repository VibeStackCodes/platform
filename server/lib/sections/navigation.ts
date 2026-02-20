/**
 * Navigation Section Renderers (4)
 *
 * Each renderer is a pure function (SectionContext) => SectionOutput producing
 * a self-contained JSX fragment string. The page assembler composes these into
 * complete route files.
 *
 * Visual taxonomy:
 *   navTopbar    — sticky horizontal top bar, hamburger on mobile (shadcn Sheet)
 *   navSidebar   — fixed left sidebar, collapsible on mobile (overlay pattern)
 *   navEditorial — minimal transparent editorial bar, magazine-style (shadcn Sheet)
 *   navMega      — top bar with full-width mega-menu dropdown on hover (shadcn Sheet mobile)
 *
 * Upgrade summary (v2):
 *   - shadcn <Button> for all nav links and CTAs
 *   - shadcn <Sheet> for mobile drawers (navTopbar, navEditorial, navMega)
 *   - shadcn <Separator> between nav sections
 *   - Lucide icons: Menu, X, ChevronDown
 *   - Scroll-aware sticky background via scrollAwareHook() (navTopbar, navMega)
 *   - h-16 md:h-[72px] height per design spec
 *   - backdrop-blur-md on sticky/scrolled state
 *   - Touch targets min-h-[44px] min-w-[44px] on all interactive elements
 *   - Skip-to-content link on ALL navs
 *   - aria-label on all <nav> elements
 */

import type { SectionRenderer, SectionOutput, SectionContext } from './types'
import { scrollAwareHook } from './primitives'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build nav link objects for all public entities */
function publicNavLinks(ctx: SectionContext): Array<{ label: string; path: string }> {
  return ctx.allEntities
    .filter((e) => !e.isPrivate)
    .map((e) => ({ label: e.pluralTitle, path: e.pluralKebab }))
}

/** Transition class when motion is enabled — used for smooth hover/focus states */
function transitionClass(ctx: SectionContext): string {
  return ctx.tokens.style.motion !== 'none' ? 'transition-colors duration-200' : ''
}

// ---------------------------------------------------------------------------
// 1. navTopbar — sticky horizontal top bar, logo left, links center, auth right
//    Mobile: shadcn Sheet from the right
//    Scroll-aware: transparent → bg-background/95 + backdrop-blur-md + shadow-sm
// ---------------------------------------------------------------------------

export const navTopbar: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const links = publicNavLinks(ctx)
  const radius = ctx.tokens.style.borderRadius
  const transition = transitionClass(ctx)
  const scroll = scrollAwareHook()

  // Desktop nav link items using shadcn Button ghost
  const desktopLinkItems = links
    .map(
      (l) =>
        `              <li>
                <Button variant="ghost" asChild className="text-sm font-medium text-muted-foreground hover:text-foreground min-h-[44px] ${transition} focus-visible:ring-2 focus-visible:ring-ring">
                  <Link to="/${l.path}">${l.label}</Link>
                </Button>
              </li>`,
    )
    .join('\n')

  // Sheet (mobile drawer) nav links
  const sheetLinkItems = links
    .map(
      (l) =>
        `              <li>
                <Button variant="ghost" asChild className="w-full justify-start text-sm font-medium text-foreground hover:bg-muted rounded-[${radius}] min-h-[44px] ${transition} focus-visible:ring-2 focus-visible:ring-ring">
                  <Link to="/${l.path}">${l.label}</Link>
                </Button>
              </li>`,
    )
    .join('\n')

  const sheetAuthSection = ctx.hasAuth
    ? `
              <li className="pt-2">
                <Separator className="mb-3" />
                <Button asChild className="w-full min-h-[44px] focus-visible:ring-2 focus-visible:ring-ring">
                  <Link to="/auth/login">Sign In</Link>
                </Button>
              </li>`
    : ''

  const desktopAuthButton = ctx.hasAuth
    ? `
              <Button asChild className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-ring">
                <Link to="/auth/login">Sign In</Link>
              </Button>`
    : ''

  return {
    jsx: `
      <header
        className={\`sticky top-0 z-50 border-b border-border h-16 md:h-[72px] \${isScrolled ? 'bg-background/95 backdrop-blur-md shadow-sm' : 'bg-transparent'} transition-all duration-300\`}
        role="banner"
      >
        {/* Skip to main content for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-[${radius}] focus:text-sm focus:font-medium focus:outline-none"
        >
          Skip to content
        </a>

        <div className="container mx-auto px-4 h-full flex items-center justify-between gap-6">

          {/* Logo / App name */}
          <Link
            to="/"
            className="flex-shrink-0 text-lg font-bold text-foreground font-[family-name:var(--font-display)] hover:opacity-80 ${transition} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm min-h-[44px] flex items-center"
            aria-label="${ctx.appName} — home"
          >
            ${ctx.appName}
          </Link>

          {/* Center nav links — hidden on mobile */}
          <nav className="hidden md:flex flex-1 justify-center" aria-label="Main navigation">
            <ul className="flex items-center gap-1 list-none m-0 p-0">
${desktopLinkItems}
            </ul>
          </nav>

          {/* Right side — auth (desktop) + Sheet trigger (mobile) */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
${desktopAuthButton}
            </div>

            {/* Mobile Sheet drawer */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open navigation menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                <SheetHeader>
                  <SheetTitle className="text-left font-[family-name:var(--font-display)]">
                    ${ctx.appName}
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-6" aria-label="Mobile navigation">
                  <ul className="flex flex-col gap-1 list-none m-0 p-0">
${sheetLinkItems}
${sheetAuthSection}
                  </ul>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>`,
    imports: [
      scroll.import,
      "import { Link } from '@tanstack/react-router'",
      "import { Button } from '@/components/ui/button'",
      "import { Separator } from '@/components/ui/separator'",
      "import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'",
      "import { Menu } from 'lucide-react'",
    ],
    hooks: [scroll.hook],
  }
}

// ---------------------------------------------------------------------------
// 2. navSidebar — fixed left sidebar w-64, collapsible on mobile
//    Uses aside + overlay pattern (Sheet doesn't apply for persistent sidebar nav)
//    Lucide Menu/X icons for toggle, shadcn Button for links
// ---------------------------------------------------------------------------

export const navSidebar: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const links = publicNavLinks(ctx)
  const radius = ctx.tokens.style.borderRadius
  const transition = transitionClass(ctx)

  const linkItems = links
    .map(
      (l) =>
        `              <li>
                <Button
                  variant="ghost"
                  asChild
                  className="w-full justify-start gap-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-[${radius}] min-h-[44px] ${transition} focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Link to="/${l.path}">
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40 flex-shrink-0" aria-hidden="true" />
                    ${l.label}
                  </Link>
                </Button>
              </li>`,
    )
    .join('\n')

  const authSection = ctx.hasAuth
    ? `
            {/* Auth */}
            <div className="pt-4">
              <Separator className="mb-4" />
              <Button asChild className="w-full min-h-[44px] focus-visible:ring-2 focus-visible:ring-ring">
                <Link to="/auth/login">Sign In</Link>
              </Button>
            </div>`
    : ''

  return {
    jsx: `
      <>
        {/* Skip to main content for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-[${radius}] focus:text-sm focus:font-medium focus:outline-none"
        >
          Skip to content
        </a>

        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile toggle button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen((o) => !o)}
          className="fixed top-4 left-4 z-50 md:hidden min-h-[44px] min-w-[44px] bg-card border border-border shadow-sm rounded-[${radius}] focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={sidebarOpen}
          aria-controls="sidebar-nav"
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {sidebarOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
        </Button>

        {/* Sidebar */}
        <aside
          id="sidebar-nav"
          className={\`fixed top-0 left-0 z-40 h-screen w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 ease-out md:translate-x-0 \${sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}\`}
          aria-label="Sidebar navigation"
        >
          {/* App name / logo */}
          <div className="flex items-center h-16 md:h-[72px] px-4 border-b border-border flex-shrink-0">
            <Link
              to="/"
              className="text-lg font-bold text-foreground font-[family-name:var(--font-display)] hover:opacity-80 ${transition} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm min-h-[44px] flex items-center"
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
      "import { Button } from '@/components/ui/button'",
      "import { Separator } from '@/components/ui/separator'",
      "import { Menu, X } from 'lucide-react'",
    ],
    hooks: ['const [sidebarOpen, setSidebarOpen] = useState(false)'],
  }
}

// ---------------------------------------------------------------------------
// 3. navEditorial — minimal transparent editorial bar, magazine serif logo
//    Desktop: uppercase tracking-wider links as ghost Buttons + outline Sign In
//    Mobile: shadcn Sheet from the right (no manual state needed)
//    No scroll-aware hook — editorial bars stay transparent by design
// ---------------------------------------------------------------------------

export const navEditorial: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const links = publicNavLinks(ctx).slice(0, 3) // editorial: keep it sparse
  const transition = transitionClass(ctx)
  const radius = ctx.tokens.style.borderRadius

  // Desktop links — uppercase, tracked, ghost buttons
  const desktopLinkItems = links
    .map(
      (l) =>
        `            <li>
              <Button
                variant="ghost"
                asChild
                className="text-xs font-semibold tracking-[0.1em] uppercase text-muted-foreground hover:text-foreground hover:bg-transparent min-h-[44px] px-2 ${transition} focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Link to="/${l.path}">${l.label}</Link>
              </Button>
            </li>`,
    )
    .join('\n')

  const desktopAuthItem = ctx.hasAuth
    ? `
            <li>
              <Button
                variant="outline"
                asChild
                className="text-xs font-semibold tracking-[0.1em] uppercase min-h-[44px] px-4 ${transition} focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Link to="/auth/login">Sign In</Link>
              </Button>
            </li>`
    : ''

  // Sheet (mobile) links
  const sheetLinkItems = links
    .map(
      (l) =>
        `              <li>
                <Button
                  variant="ghost"
                  asChild
                  className="w-full justify-start text-sm font-semibold tracking-wide uppercase text-foreground hover:bg-muted rounded-[${radius}] min-h-[44px] ${transition} focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Link to="/${l.path}">${l.label}</Link>
                </Button>
              </li>`,
    )
    .join('\n')

  const sheetAuthItem = ctx.hasAuth
    ? `
              <li className="pt-2">
                <Separator className="mb-3" />
                <Button
                  asChild
                  className="w-full min-h-[44px] text-xs font-semibold tracking-[0.1em] uppercase focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Link to="/auth/login">Sign In</Link>
                </Button>
              </li>`
    : ''

  return {
    jsx: `
      <header className="border-b border-border/50 bg-transparent h-16 md:h-[72px] flex items-center" role="banner">
        {/* Skip to main content for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-foreground focus:text-background focus:text-sm focus:font-medium focus:rounded-sm focus:outline-none"
        >
          Skip to content
        </a>

        <div className="container mx-auto px-6 w-full flex items-center justify-between gap-8">

          {/* Italic serif logo */}
          <Link
            to="/"
            className="flex-shrink-0 text-xl font-bold italic tracking-tight text-foreground font-[family-name:var(--font-display)] hover:opacity-70 ${transition} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm min-h-[44px] flex items-center"
            aria-label="${ctx.appName} — home"
          >
            ${ctx.appName}
          </Link>

          {/* Right side — uppercase links + auth (desktop) */}
          <nav className="hidden md:flex items-center" aria-label="Editorial navigation">
            <ul className="flex items-center gap-2 list-none m-0 p-0">
${desktopLinkItems}
${desktopAuthItem}
            </ul>
          </nav>

          {/* Mobile Sheet drawer */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-[320px]">
              <SheetHeader>
                <SheetTitle className="text-left italic font-[family-name:var(--font-display)] tracking-tight">
                  ${ctx.appName}
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-6" aria-label="Mobile editorial navigation">
                <ul className="flex flex-col gap-1 list-none m-0 p-0">
${sheetLinkItems}
${sheetAuthItem}
                </ul>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>`,
    imports: [
      "import { Link } from '@tanstack/react-router'",
      "import { Button } from '@/components/ui/button'",
      "import { Separator } from '@/components/ui/separator'",
      "import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'",
      "import { Menu } from 'lucide-react'",
    ],
    hooks: [],
  }
}

// ---------------------------------------------------------------------------
// 4. navMega — top bar with full-width mega-menu dropdown on hover
//    Desktop: category trigger buttons with ChevronDown, mega panel on hover/focus
//    Mobile: shadcn Sheet with flat link list
//    Scroll-aware: transparent → bg-background/95 + backdrop-blur-md + shadow-sm
// ---------------------------------------------------------------------------

export const navMega: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const links = publicNavLinks(ctx)
  const radius = ctx.tokens.style.borderRadius
  const transition = transitionClass(ctx)
  const scroll = scrollAwareHook()

  // Desktop trigger buttons — each opens the mega panel
  const topbarLinkItems = links
    .map(
      (l) =>
        `              <li>
                <Button
                  variant="ghost"
                  type="button"
                  onMouseEnter={() => setActiveMenu('${l.path}')}
                  onFocus={() => setActiveMenu('${l.path}')}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground gap-1 min-h-[44px] ${transition} focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={activeMenu === '${l.path}'}
                  aria-haspopup="true"
                >
                  ${l.label}
                  <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
                </Button>
              </li>`,
    )
    .join('\n')

  // Mega panel dropdown links (desktop)
  const dropdownLinks = links
    .map(
      (l) =>
        `                  <li>
                    <Button
                      variant="ghost"
                      asChild
                      className="w-full justify-start text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-[${radius}] min-h-[44px] ${transition} focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Link to="/${l.path}" onClick={() => setActiveMenu(null)}>
                        ${l.label}
                      </Link>
                    </Button>
                  </li>`,
    )
    .join('\n')

  // Sheet (mobile drawer) links
  const sheetLinkItems = links
    .map(
      (l) =>
        `              <li>
                <Button
                  variant="ghost"
                  asChild
                  className="w-full justify-start text-sm font-medium text-foreground hover:bg-muted rounded-[${radius}] min-h-[44px] ${transition} focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Link to="/${l.path}">${l.label}</Link>
                </Button>
              </li>`,
    )
    .join('\n')

  const desktopAuthButton = ctx.hasAuth
    ? `
              <Button asChild className="min-h-[44px] focus-visible:ring-2 focus-visible:ring-ring">
                <Link to="/auth/login">Sign In</Link>
              </Button>`
    : ''

  const sheetAuthSection = ctx.hasAuth
    ? `
              <li className="pt-2">
                <Separator className="mb-3" />
                <Button asChild className="w-full min-h-[44px] focus-visible:ring-2 focus-visible:ring-ring">
                  <Link to="/auth/login">Sign In</Link>
                </Button>
              </li>`
    : ''

  return {
    jsx: `
      <header
        className={\`sticky top-0 z-50 border-b border-border h-16 md:h-[72px] \${isScrolled ? 'bg-background/95 backdrop-blur-md shadow-sm' : 'bg-transparent'} transition-all duration-300\`}
        role="banner"
        onMouseLeave={() => setActiveMenu(null)}
      >
        {/* Skip to main content for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-[${radius}] focus:text-sm focus:font-medium focus:outline-none"
        >
          Skip to content
        </a>

        <div className="container mx-auto px-4 h-full flex items-center justify-between gap-6">

          {/* Logo */}
          <Link
            to="/"
            className="flex-shrink-0 text-lg font-bold text-foreground font-[family-name:var(--font-display)] hover:opacity-80 ${transition} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm min-h-[44px] flex items-center"
            aria-label="${ctx.appName} — home"
          >
            ${ctx.appName}
          </Link>

          {/* Category trigger buttons — desktop only */}
          <nav className="hidden md:flex flex-1 justify-center" aria-label="Main navigation">
            <ul className="flex items-center gap-1 list-none m-0 p-0">
${topbarLinkItems}
            </ul>
          </nav>

          {/* Auth + mobile Sheet trigger */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
${desktopAuthButton}
            </div>

            {/* Mobile Sheet drawer */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open navigation menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[320px]">
                <SheetHeader>
                  <SheetTitle className="text-left font-[family-name:var(--font-display)]">
                    ${ctx.appName}
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-6" aria-label="Mobile navigation">
                  <ul className="flex flex-col gap-1 list-none m-0 p-0">
${sheetLinkItems}
${sheetAuthSection}
                  </ul>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Mega dropdown panel — desktop only */}
        {activeMenu !== null && (
          <div
            className="hidden md:block absolute left-0 w-full bg-card/95 backdrop-blur-md border-b border-border shadow-lg z-40"
            role="region"
            aria-label="Navigation dropdown"
            onMouseEnter={() => setActiveMenu(activeMenu)}
          >
            <div className="container mx-auto px-4 py-5">
              <ul className="grid grid-cols-3 md:grid-cols-4 gap-1 list-none m-0 p-0">
${dropdownLinks}
              </ul>
            </div>
          </div>
        )}
      </header>`,
    imports: [
      scroll.import,
      "import { useState } from 'react'",
      "import { Link } from '@tanstack/react-router'",
      "import { Button } from '@/components/ui/button'",
      "import { Separator } from '@/components/ui/separator'",
      "import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'",
      "import { Menu, ChevronDown } from 'lucide-react'",
    ],
    hooks: [
      scroll.hook,
      'const [activeMenu, setActiveMenu] = useState<string | null>(null)',
    ],
  }
}
