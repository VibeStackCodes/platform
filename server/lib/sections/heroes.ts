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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns the pluralKebab of the first non-private entity, or '' */
function firstPublicPath(ctx: SectionContext): string {
  return ctx.allEntities.find((e) => !e.isPrivate)?.pluralKebab ?? ''
}

/** Entrance animation class when motion is enabled */
function entranceClass(ctx: SectionContext): string {
  return ctx.tokens.style.motion !== 'none'
    ? 'transition-all duration-700 ease-out'
    : ''
}

/** Returns the hero image url with picsum fallback */
function imgUrl(ctx: SectionContext): string {
  return ctx.heroImages[0]?.url ?? 'https://picsum.photos/1920/1080'
}

/** Returns the hero image alt text */
function imgAlt(ctx: SectionContext): string {
  return ctx.heroImages[0]?.alt ?? ''
}

// ---------------------------------------------------------------------------
// 1. heroFullbleed — dramatic full-screen image with centered overlay text
// ---------------------------------------------------------------------------

export const heroFullbleed: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || ctx.tokens.textSlots.hero_headline
  const subtext = (ctx.config.subtext as string) || ctx.tokens.textSlots.hero_subtext
  const cta = ctx.tokens.textSlots.cta_label
  const ctaPath = firstPublicPath(ctx)
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <section id="hero" className="relative h-[70vh] min-h-[500px] overflow-hidden" aria-label="Hero">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src="${imgUrl(ctx)}"
            alt="${imgAlt(ctx)}"
            className="h-full w-full object-cover"
          />
          <div
            className="absolute inset-0 bg-black/45"
            role="presentation"
            aria-hidden="true"
          />
        </div>

        {/* Centered content */}
        <div className="relative z-10 flex h-full items-center justify-center text-center px-4">
          <div className="max-w-3xl ${motion}">
            <h1
              className="text-4xl md:text-6xl font-bold text-white font-[family-name:var(--font-display)] mb-4 drop-shadow-lg"
            >
              ${headline}
            </h1>
            <p className="text-lg md:text-xl text-white/85 mb-8 max-w-xl mx-auto leading-relaxed">
              ${subtext}
            </p>
            <Link
              to="/${ctaPath}"
              className="inline-flex items-center px-8 py-3 bg-primary text-primary-foreground rounded-[${radius}] font-semibold text-sm tracking-wide hover:opacity-90 active:scale-95 transition-all"
            >
              ${cta}
            </Link>
          </div>
        </div>
      </section>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
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
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <section id="hero" className="bg-background border-b border-border" aria-label="Hero">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">

            {/* Left — text column */}
            <div className="flex flex-col gap-6 ${motion}">
              <h1
                className="text-4xl md:text-5xl font-bold text-foreground font-[family-name:var(--font-display)] leading-tight"
              >
                ${headline}
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-md">
                ${subtext}
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to="/${ctaPath}"
                  className="inline-flex items-center px-7 py-3 bg-primary text-primary-foreground rounded-[${radius}] font-medium hover:opacity-90 active:scale-95 transition-all shadow-sm"
                >
                  ${cta}
                </Link>
              </div>
            </div>

            {/* Right — image column */}
            <div className="relative ${motion}">
              <img
                src="${imgUrl(ctx)}"
                alt="${imgAlt(ctx)}"
                className="w-full h-[420px] md:h-[480px] object-cover rounded-[${radius}] shadow-xl"
              />
            </div>

          </div>
        </div>
      </section>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
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
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <section id="hero" className="bg-accent/5 border-b border-border" aria-label="Hero">
        <div className="container mx-auto px-4 py-20 md:py-28 flex flex-col items-center text-center gap-6">

          {/* Text block */}
          <div className="max-w-2xl ${motion}">
            <h1
              className="text-4xl md:text-6xl font-bold text-foreground font-[family-name:var(--font-display)] leading-tight mb-4"
            >
              ${headline}
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-8">
              ${subtext}
            </p>
            <Link
              to="/${ctaPath}"
              className="inline-flex items-center px-8 py-3 bg-primary text-primary-foreground rounded-[${radius}] font-medium hover:opacity-90 active:scale-95 transition-all"
            >
              ${cta}
            </Link>
          </div>

          {/* Hero image — below text, not behind */}
          <div className="w-full max-w-4xl mt-8 ${motion}">
            <img
              src="${imgUrl(ctx)}"
              alt="${imgAlt(ctx)}"
              className="w-full h-64 md:h-96 object-cover rounded-[${radius}] shadow-lg"
            />
          </div>

        </div>
      </section>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
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
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)
  const poster = imgUrl(ctx)

  return {
    jsx: `
      <section id="hero" className="relative h-[70vh] min-h-[500px] overflow-hidden" aria-label="Hero">

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

        {/* Dark scrim */}
        <div
          className="absolute inset-0 bg-black/50"
          role="presentation"
          aria-hidden="true"
        />

        {/* Centered content */}
        <div className="relative z-10 flex h-full items-center justify-center text-center px-4">
          <div className="max-w-3xl ${motion}">
            <h1
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-white font-[family-name:var(--font-display)] mb-4 drop-shadow-xl"
            >
              ${headline}
            </h1>
            <p className="text-lg md:text-xl text-white/80 mb-10 max-w-xl mx-auto leading-relaxed">
              ${subtext}
            </p>
            <Link
              to="/${ctaPath}"
              className="inline-flex items-center px-8 py-3.5 bg-primary text-primary-foreground rounded-[${radius}] font-semibold tracking-wide hover:opacity-90 active:scale-95 transition-all shadow-lg"
            >
              ${cta}
            </Link>
          </div>
        </div>

      </section>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
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
  const radius = ctx.tokens.style.borderRadius
  const isAnimated = ctx.tokens.style.motion !== 'none'

  // Animate the gradient via a CSS keyframe class when motion is on.
  // The inline style + Tailwind arbitrary property drives the animation.
  const gradientClass = isAnimated
    ? 'animate-[gradient-shift_8s_ease-in-out_infinite] bg-[length:200%_200%]'
    : ''

  return {
    jsx: `
      <section
        id="hero"
        className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-accent/10 to-background ${gradientClass} border-b border-border"
        aria-label="Hero"
      >
        {/* Decorative blobs */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
          role="presentation"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-accent/15 blur-3xl"
          role="presentation"
          aria-hidden="true"
        />

        <div className="relative container mx-auto px-4 py-24 md:py-36 flex flex-col items-center text-center gap-6">
          <div className="${isAnimated ? 'transition-all duration-700' : ''}">
            <span className="inline-block text-xs font-semibold tracking-[0.2em] uppercase text-primary/70 mb-4">
              ${ctx.appName}
            </span>
            <h1
              className="text-5xl md:text-7xl font-bold text-foreground font-[family-name:var(--font-display)] leading-[1.1] mb-5 max-w-3xl"
            >
              ${headline}
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-10 max-w-xl">
              ${subtext}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/${ctaPath}"
                className="inline-flex items-center px-8 py-3 bg-primary text-primary-foreground rounded-[${radius}] font-semibold text-sm hover:opacity-90 active:scale-95 transition-all shadow-md"
              >
                ${cta}
              </Link>
            </div>
          </div>
        </div>
      </section>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
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
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <section
        id="hero"
        className="bg-background border-b border-border"
        aria-label="Hero"
      >
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-[3fr_2fr] gap-0 md:gap-10 items-stretch min-h-[520px]">

            {/* Left — large serif headline column */}
            <div className="flex flex-col justify-center py-16 md:py-20 pr-0 md:pr-8 border-r border-border ${motion}">
              <p className="text-[10px] font-semibold tracking-[0.25em] uppercase text-muted-foreground mb-6">
                ${ctx.appName}
              </p>
              <h1
                className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground font-[family-name:var(--font-display)] leading-[1.05] mb-6"
                style={{ hyphens: 'auto' }}
              >
                ${headline}
              </h1>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-sm mb-8">
                ${subtext}
              </p>
              <div>
                <Link
                  to="/${ctaPath}"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-foreground border border-foreground px-6 py-2.5 rounded-[${radius}] hover:bg-foreground hover:text-background transition-all"
                >
                  ${cta}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>

            {/* Right — tall editorial photo */}
            <div className="relative hidden md:block ${motion}">
              <img
                src="${imgUrl(ctx)}"
                alt="${imgAlt(ctx)}"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-l from-transparent to-background/10"
                role="presentation"
                aria-hidden="true"
              />
            </div>

          </div>
        </div>
      </section>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
  }
}
