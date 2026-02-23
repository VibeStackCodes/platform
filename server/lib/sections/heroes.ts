/**
 * Hero Section Renderers (6)
 *
 * Each renderer is a pure function (SectionContext) => SectionOutput producing
 * a self-contained JSX fragment string. The page assembler composes these into
 * complete route files.
 *
 * Visual taxonomy:
 *   heroFullbleed  — dramatic full-screen image with dark overlay
 *   heroSplit      — two-column image/text, corporate
 *   heroCentered   — warm editorial, image below text
 *   heroVideo      — cinematic video background
 *   heroGradient   — animated CSS gradient, no image, SaaS/tech
 *   heroEditorial  — magazine serif split layout
 */

import type { SectionRenderer, SectionOutput, SectionContext } from './types'
import { animateEntrance, resolveBg, resolveSpacing } from './primitives'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns the pluralKebab of the first non-private entity, or '' */
function firstPublicPath(ctx: SectionContext): string {
  return ctx.allEntities.find((e) => !e.isPrivate)?.pluralKebab ?? ''
}

/** Returns the hero image url with img.vibestack.codes fallback */
function imgUrl(ctx: SectionContext): string {
  return ctx.heroImages[0]?.url ?? 'https://img.vibestack.codes/s/hero%20background%20landscape/1920/1080'
}

/** Returns the hero image alt text */
function imgAlt(ctx: SectionContext): string {
  return ctx.heroImages[0]?.alt ?? ''
}

/** Whether motion is enabled for this theme */
function hasMotion(ctx: SectionContext): boolean {
  return ctx.tokens.style.motion !== 'none'
}

// Canonical import strings — identical across all renderers so the page
// assembler's Set-based dedup works correctly.
const IMPORT_LINK = "import { Link } from '@tanstack/react-router'"
const IMPORT_BUTTON = "import { Button } from '@/components/ui/button'"
const IMPORT_LUCIDE_HERO = "import { ArrowRight, ChevronDown } from 'lucide-react'"

// ---------------------------------------------------------------------------
// 1. heroFullbleed — dramatic full-screen image with centered overlay text
// ---------------------------------------------------------------------------

export const heroFullbleed: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || ctx.tokens.textSlots.hero_headline
  const subtext = (ctx.config.subtext as string) || ctx.tokens.textSlots.hero_subtext
  const cta = ctx.tokens.textSlots.cta_label
  const ctaPath = firstPublicPath(ctx)
  const motion = hasMotion(ctx)

  const headlineClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 0 })
    : ''
  const subtextClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 100 })
    : ''
  const ctaClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 200 })
    : ''
  const scrollClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 2, durationMs: 700, delayMs: 300 })
    : ''

  return {
    jsx: `
      <section id="hero" className="relative min-h-screen overflow-hidden flex flex-col" aria-label="Hero">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="${imgUrl(ctx)}"
            alt="${imgAlt(ctx)}"
            className="h-full w-full object-cover"
            loading="eager"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20"
            role="presentation"
            aria-hidden="true"
          />
        </div>

        {/* Centered content */}
        <div className="relative z-10 flex flex-1 items-center justify-center text-center px-6">
          <div className="max-w-3xl">
            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white font-[family-name:var(--font-display)] mb-6 drop-shadow-lg leading-[1.08] ${headlineClass}"
            >
              ${headline}
            </h1>
            <p className="text-lg md:text-xl text-white/85 mb-10 max-w-xl mx-auto leading-relaxed ${subtextClass}">
              ${subtext}
            </p>
            <div className="${ctaClass}">
              <Button variant="default" size="lg" asChild>
                <Link to="/${ctaPath}">
                  ${cta}
                  <ArrowRight className="size-4 ml-2" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="relative z-10 flex justify-center pb-8 ${scrollClass}">
          <ChevronDown className="size-6 text-white/60 animate-bounce" aria-hidden="true" />
        </div>
      </section>`,
    imports: [IMPORT_LINK, IMPORT_BUTTON, IMPORT_LUCIDE_HERO],
  }
}

// ---------------------------------------------------------------------------
// 2. heroSplit — two-column layout, left text + right image, corporate feel
// ---------------------------------------------------------------------------

export const heroSplit: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || ctx.tokens.textSlots.hero_headline
  const subtext = (ctx.config.subtext as string) || ctx.tokens.textSlots.hero_subtext
  const cta = ctx.tokens.textSlots.cta_label
  const ctaPath = firstPublicPath(ctx)
  const radius = ctx.tokens.style.borderRadius
  const motion = hasMotion(ctx)
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const textColClass = motion
    ? animateEntrance(ctx, { direction: 'left', distance: 4, durationMs: 700, delayMs: 0 })
    : ''
  const imgColClass = motion
    ? animateEntrance(ctx, { direction: 'right', distance: 4, durationMs: 700, delayMs: 150 })
    : ''
  const subtextClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 100 })
    : ''
  const ctaClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 200 })
    : ''

  return {
    jsx: `
      <section id="hero" className="${bg} border-b border-border" aria-label="Hero">
        <div className="container mx-auto px-6 ${spacing}">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">

            {/* Left — text column */}
            <div className="flex flex-col gap-6 ${textColClass}">
              <h1
                className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground font-[family-name:var(--font-display)] leading-tight ${subtextClass}"
              >
                ${headline}
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-md ${subtextClass}">
                ${subtext}
              </p>
              <div className="flex flex-wrap gap-3 pt-2 ${ctaClass}">
                <Button variant="default" size="lg" asChild>
                  <Link to="/${ctaPath}">
                    ${cta}
                    <ArrowRight className="size-4 ml-2" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right — image column */}
            <div className="relative ${imgColClass}">
              <img
                src="${imgUrl(ctx)}"
                alt="${imgAlt(ctx)}"
                className="w-full h-[420px] md:h-[500px] object-cover rounded-[${radius}] shadow-xl"
                loading="eager"
              />
              {/* Subtle vignette on the image */}
              <div
                className="absolute inset-0 rounded-[${radius}] ring-1 ring-inset ring-black/10 pointer-events-none"
                role="presentation"
                aria-hidden="true"
              />
            </div>

          </div>
        </div>
      </section>`,
    imports: [IMPORT_LINK, IMPORT_BUTTON, IMPORT_LUCIDE_HERO],
  }
}

// ---------------------------------------------------------------------------
// 3. heroCentered — warm editorial, generous padding, image below text
// ---------------------------------------------------------------------------

export const heroCentered: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || ctx.tokens.textSlots.hero_headline
  const subtext = (ctx.config.subtext as string) || ctx.tokens.textSlots.hero_subtext
  const cta = ctx.tokens.textSlots.cta_label
  const ctaPath = firstPublicPath(ctx)
  const radius = ctx.tokens.style.borderRadius
  const motion = hasMotion(ctx)
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const headlineClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 0 })
    : ''
  const subtextClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 100 })
    : ''
  const ctaClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 200 })
    : ''
  const imgClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 6, durationMs: 800, delayMs: 300 })
    : ''

  return {
    jsx: `
      <section id="hero" className="${bg} border-b border-border" aria-label="Hero">
        <div className="container mx-auto px-6 ${spacing} flex flex-col items-center text-center gap-6">

          {/* Text block */}
          <div className="max-w-2xl flex flex-col items-center gap-5">
            <h1
              className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground font-[family-name:var(--font-display)] leading-tight ${headlineClass}"
            >
              ${headline}
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed ${subtextClass}">
              ${subtext}
            </p>
            <div className="${ctaClass}">
              <Button variant="default" size="lg" asChild>
                <Link to="/${ctaPath}">
                  ${cta}
                  <ArrowRight className="size-4 ml-2" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Hero image — below text, not behind */}
          <div className="w-full max-w-4xl mt-6 ${imgClass}">
            <img
              src="${imgUrl(ctx)}"
              alt="${imgAlt(ctx)}"
              className="w-full h-64 md:h-96 object-cover rounded-[${radius}] shadow-xl ring-1 ring-black/10"
              loading="eager"
            />
          </div>

        </div>
      </section>`,
    imports: [IMPORT_LINK, IMPORT_BUTTON, IMPORT_LUCIDE_HERO],
  }
}

// ---------------------------------------------------------------------------
// 4. heroVideo — cinematic video background with fallback to image poster
// ---------------------------------------------------------------------------

export const heroVideo: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || ctx.tokens.textSlots.hero_headline
  const subtext = (ctx.config.subtext as string) || ctx.tokens.textSlots.hero_subtext
  const cta = ctx.tokens.textSlots.cta_label
  const ctaPath = firstPublicPath(ctx)
  const motion = hasMotion(ctx)
  const poster = imgUrl(ctx)

  const headlineClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 0 })
    : ''
  const subtextClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 100 })
    : ''
  const ctaClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 200 })
    : ''
  const scrollClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 2, durationMs: 700, delayMs: 300 })
    : ''

  return {
    jsx: `
      <section id="hero" className="relative min-h-screen overflow-hidden flex flex-col" aria-label="Hero">

        {/* Video background — falls back to poster image if video src is empty */}
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          poster="${poster}"
          aria-hidden="true"
        >
          {/* No src — browser shows poster image as static fallback */}
        </video>

        {/* Rich dark scrim for text legibility */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20"
          role="presentation"
          aria-hidden="true"
        />

        {/* Centered content */}
        <div className="relative z-10 flex flex-1 items-center justify-center text-center px-6">
          <div className="max-w-3xl">
            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white font-[family-name:var(--font-display)] mb-6 drop-shadow-lg leading-[1.08] ${headlineClass}"
            >
              ${headline}
            </h1>
            <p className="text-lg md:text-xl text-white/85 mb-10 max-w-xl mx-auto leading-relaxed ${subtextClass}">
              ${subtext}
            </p>
            <div className="${ctaClass}">
              <Button variant="default" size="lg" asChild>
                <Link to="/${ctaPath}">
                  ${cta}
                  <ArrowRight className="size-4 ml-2" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="relative z-10 flex justify-center pb-8 ${scrollClass}">
          <ChevronDown className="size-6 text-white/60 animate-bounce" aria-hidden="true" />
        </div>

      </section>`,
    imports: [IMPORT_LINK, IMPORT_BUTTON, IMPORT_LUCIDE_HERO],
  }
}

// ---------------------------------------------------------------------------
// 5. heroGradient — animated CSS gradient, no image, SaaS/tech vibe
// ---------------------------------------------------------------------------

export const heroGradient: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || ctx.tokens.textSlots.hero_headline
  const subtext = (ctx.config.subtext as string) || ctx.tokens.textSlots.hero_subtext
  const cta = ctx.tokens.textSlots.cta_label
  const ctaPath = firstPublicPath(ctx)
  const motion = hasMotion(ctx)
  const spacing = resolveSpacing(ctx.config)

  // Animate the gradient via a CSS keyframe class when motion is on.
  const gradientAnimClass = motion
    ? 'animate-[gradient-shift_8s_ease-in-out_infinite] bg-[length:200%_200%]'
    : ''

  const badgeClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 2, durationMs: 500, delayMs: 0 })
    : ''
  const headlineClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 100 })
    : ''
  const subtextClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 200 })
    : ''
  const ctaClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 300 })
    : ''

  return {
    jsx: `
      <section
        id="hero"
        className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-accent/10 to-background ${gradientAnimClass} border-b border-border"
        aria-label="Hero"
      >
        {/* Decorative ambient blobs */}
        <div
          className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl"
          role="presentation"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl"
          role="presentation"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl"
          role="presentation"
          aria-hidden="true"
        />

        <div className="relative container mx-auto px-6 ${spacing} flex flex-col items-center text-center gap-6">
          <span className="inline-block text-xs font-semibold tracking-[0.2em] uppercase text-primary/70 mb-2 ${badgeClass}">
            ${ctx.appName}
          </span>
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground font-[family-name:var(--font-display)] leading-[1.08] max-w-4xl ${headlineClass}"
          >
            ${headline}
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl ${subtextClass}">
            ${subtext}
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-2 ${ctaClass}">
            <Button variant="default" size="lg" asChild>
              <Link to="/${ctaPath}">
                ${cta}
                <ArrowRight className="size-4 ml-2" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>`,
    imports: [IMPORT_LINK, IMPORT_BUTTON, IMPORT_LUCIDE_HERO],
  }
}

// ---------------------------------------------------------------------------
// 6. heroEditorial — magazine serif split, large headline left, photo right
// ---------------------------------------------------------------------------

export const heroEditorial: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || ctx.tokens.textSlots.hero_headline
  const subtext = (ctx.config.subtext as string) || ctx.tokens.textSlots.hero_subtext
  const cta = ctx.tokens.textSlots.cta_label
  const ctaPath = firstPublicPath(ctx)
  const radius = ctx.tokens.style.borderRadius
  const motion = hasMotion(ctx)
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const textColClass = motion
    ? animateEntrance(ctx, { direction: 'left', distance: 4, durationMs: 700, delayMs: 0 })
    : ''
  const headlineClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 100 })
    : ''
  const subtextClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 200 })
    : ''
  const ctaClass = motion
    ? animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700, delayMs: 300 })
    : ''
  const imgColClass = motion
    ? animateEntrance(ctx, { direction: 'right', distance: 4, durationMs: 700, delayMs: 150 })
    : ''

  return {
    jsx: `
      <section
        id="hero"
        className="${bg} border-b border-border"
        aria-label="Hero"
      >
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-[3fr_2fr] gap-0 md:gap-12 items-stretch min-h-screen md:min-h-[640px]">

            {/* Left — large serif headline column */}
            <div className="flex flex-col justify-center ${spacing} pr-0 md:pr-10 border-r border-border ${textColClass}">
              <p className="text-[10px] font-semibold tracking-[0.3em] uppercase text-muted-foreground mb-8">
                ${ctx.appName}
              </p>
              <h1
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground font-[family-name:var(--font-display)] leading-[1.05] mb-6 ${headlineClass}"
                style={{ hyphens: 'auto' }}
              >
                ${headline}
              </h1>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-sm mb-10 ${subtextClass}">
                ${subtext}
              </p>
              <div className="${ctaClass}">
                <Button variant="outline" size="lg" asChild className="group">
                  <Link to="/${ctaPath}">
                    ${cta}
                    <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right — tall editorial photo */}
            <div className="relative hidden md:block ${imgColClass}">
              <img
                src="${imgUrl(ctx)}"
                alt="${imgAlt(ctx)}"
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
              />
              {/* Edge-blend toward text column */}
              <div
                className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-background/20"
                role="presentation"
                aria-hidden="true"
              />
              {/* Bottom vignette */}
              <div
                className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-background/30 to-transparent"
                role="presentation"
                aria-hidden="true"
              />
              {/* Subtle decorative caption area */}
              <div className="absolute bottom-6 right-6">
                <span className="inline-block bg-background/80 backdrop-blur-sm text-[10px] font-medium tracking-widest uppercase text-muted-foreground px-3 py-1.5 rounded-[${radius}] border border-border/60">
                  ${ctx.appName}
                </span>
              </div>
            </div>

          </div>
        </div>
      </section>`,
    imports: [IMPORT_LINK, IMPORT_BUTTON, IMPORT_LUCIDE_HERO],
  }
}
