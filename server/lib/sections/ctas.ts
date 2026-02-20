/**
 * CTA Section Renderers (5)
 *
 * Each renderer is a pure function (SectionContext) => SectionOutput producing
 * a self-contained JSX fragment string. The page assembler composes these into
 * complete route files.
 *
 * Visual taxonomy:
 *   ctaNewsletter      — centered newsletter signup with muted background
 *   ctaNewsletterSplit — split layout, text left + input right, bordered
 *   ctaPricing         — 3-tier pricing cards, middle card highlighted
 *   ctaDownload        — full-width primary-colour download banner
 *   ctaContact         — centered contact form with all accessible labels
 */

import type { SectionRenderer, SectionOutput, SectionContext } from './types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Entrance animation class when motion is enabled */
function entranceClass(ctx: SectionContext): string {
  return ctx.tokens.style.motion !== 'none'
    ? 'transition-all duration-700 ease-out'
    : ''
}

// ---------------------------------------------------------------------------
// 1. ctaNewsletter — centered newsletter signup with bg-muted/30 background
// ---------------------------------------------------------------------------

export const ctaNewsletter: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || 'Stay updated'
  const description =
    (ctx.config.description as string) ||
    `Get the latest from ${ctx.appName} delivered to your inbox.`
  const buttonLabel = (ctx.config.buttonLabel as string) || ctx.tokens.textSlots.cta_label
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <section
        className="bg-muted/30 border-y border-border"
        aria-label="Newsletter signup"
      >
        <div className="container mx-auto px-4 py-16 md:py-20">
          <div className="max-w-lg mx-auto text-center ${motion}">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-3">
              ${headline}
            </h2>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-8">
              ${description}
            </p>
            <form
              onSubmit={e => e.preventDefault()}
              className="flex flex-col sm:flex-row gap-3"
              aria-label="Newsletter subscription form"
            >
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                className="flex-1 rounded-[${radius}] border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="submit"
                className="shrink-0 rounded-[${radius}] bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 active:scale-95 transition-all"
              >
                ${buttonLabel}
              </button>
            </form>
          </div>
        </div>
      </section>`,
  }
}

// ---------------------------------------------------------------------------
// 2. ctaNewsletterSplit — split layout, text left + form right, border separators
// ---------------------------------------------------------------------------

export const ctaNewsletterSplit: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || 'Stay updated'
  const description =
    (ctx.config.description as string) ||
    `Join the ${ctx.appName} community and never miss an update.`
  const buttonLabel = (ctx.config.buttonLabel as string) || ctx.tokens.textSlots.cta_label
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <section
        className="border-y border-border bg-background"
        aria-label="Newsletter signup"
      >
        <div className="container mx-auto px-4 py-14 md:py-18">
          <div className="grid md:grid-cols-2 gap-10 items-center ${motion}">

            {/* Left — text column */}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-3 leading-tight">
                ${headline}
              </h2>
              <p className="text-muted-foreground text-sm md:text-base leading-relaxed max-w-sm">
                ${description}
              </p>
            </div>

            {/* Right — email input + submit */}
            <div>
              <form
                onSubmit={e => e.preventDefault()}
                className="flex flex-col sm:flex-row gap-3"
                aria-label="Newsletter subscription form"
              >
                <label htmlFor="newsletter-split-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="newsletter-split-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  className="flex-1 rounded-[${radius}] border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-[${radius}] bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 active:scale-95 transition-all"
                >
                  ${buttonLabel}
                </button>
              </form>
            </div>

          </div>
        </div>
      </section>`,
  }
}

// ---------------------------------------------------------------------------
// 3. ctaPricing — 3 pricing tier cards, middle card highlighted with ring
// ---------------------------------------------------------------------------

interface PricingPlan {
  name: string
  price: string
  period: string
  features: string[]
  cta: string
  highlighted: boolean
}

function defaultPlans(): PricingPlan[] {
  return [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      features: ['Up to 3 projects', 'Basic analytics', 'Community support'],
      cta: 'Get started',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '$19',
      period: 'per month',
      features: [
        'Unlimited projects',
        'Advanced analytics',
        'Priority support',
        'Custom domain',
      ],
      cta: 'Start free trial',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 'Contact us',
      period: '',
      features: [
        'Everything in Pro',
        'SLA & dedicated support',
        'SSO & audit logs',
        'Custom integrations',
      ],
      cta: 'Contact sales',
      highlighted: false,
    },
  ]
}

export const ctaPricing: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || 'Simple, transparent pricing'
  const subtext =
    (ctx.config.subtext as string) || 'Choose the plan that fits your needs.'
  const plans = (ctx.config.plans as PricingPlan[] | undefined) ?? defaultPlans()
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)

  const planCards = plans
    .map((plan) => {
      const highlightClasses = plan.highlighted
        ? 'border-primary ring-2 ring-primary shadow-lg scale-[1.02]'
        : 'border-border'
      const featureItems = plan.features
        .map(
          (f) => `
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-0.5 text-primary" aria-hidden="true">✓</span>
                <span>${f}</span>
              </li>`,
        )
        .join('')

      return `
            <div
              className="relative flex flex-col rounded-[${radius}] border bg-background px-6 py-8 ${highlightClasses} ${motion}"
              ${plan.highlighted ? 'aria-label="Recommended plan"' : ''}
            >
              ${
                plan.highlighted
                  ? `<span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                Most popular
              </span>`
                  : ''
              }
              <h3 className="text-lg font-bold text-foreground font-[family-name:var(--font-display)] mb-1">
                ${plan.name}
              </h3>
              <div className="mb-6">
                <span className="text-3xl font-extrabold text-foreground">${plan.price}</span>
                ${plan.period ? `<span className="ml-1 text-sm text-muted-foreground">${plan.period}</span>` : ''}
              </div>
              <ul className="flex flex-col gap-2 mb-8 flex-1" aria-label="${plan.name} plan features">
                ${featureItems}
              </ul>
              <button
                type="button"
                className="w-full rounded-[${radius}] ${plan.highlighted ? 'bg-primary text-primary-foreground' : 'border border-border bg-background text-foreground hover:bg-muted/50'} px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              >
                ${plan.cta}
              </button>
            </div>`
    })
    .join('')

  return {
    jsx: `
      <section
        className="bg-background border-y border-border"
        aria-label="Pricing plans"
      >
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12 ${motion}">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground font-[family-name:var(--font-display)] mb-3">
              ${headline}
            </h2>
            <p className="text-muted-foreground text-base max-w-md mx-auto">
              ${subtext}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start max-w-5xl mx-auto">
            ${planCards}
          </div>
        </div>
      </section>`,
  }
}

// ---------------------------------------------------------------------------
// 4. ctaDownload — full-width primary-colour banner with headline + CTA button
// ---------------------------------------------------------------------------

export const ctaDownload: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || `Get ${ctx.appName} today`
  const subtitle =
    (ctx.config.subtitle as string) ||
    'Start for free. No credit card required. Cancel anytime.'
  const buttonLabel = (ctx.config.buttonLabel as string) || ctx.tokens.textSlots.cta_label
  const buttonHref = (ctx.config.buttonHref as string) || '#'
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <section
        className="bg-primary text-primary-foreground"
        aria-label="Download or get started"
      >
        <div className="container mx-auto px-4 py-14 md:py-20 text-center ${motion}">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold font-[family-name:var(--font-display)] mb-4 leading-tight">
            ${headline}
          </h2>
          <p className="text-primary-foreground/80 text-base md:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
            ${subtitle}
          </p>
          <a
            href="${buttonHref}"
            className="inline-flex items-center gap-2 rounded-[${radius}] bg-background text-foreground px-8 py-3 text-sm font-semibold hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            ${buttonLabel}
          </a>
        </div>
      </section>`,
  }
}

// ---------------------------------------------------------------------------
// 5. ctaContact — accessible contact form, max-w-2xl centered, optional info
// ---------------------------------------------------------------------------

export const ctaContact: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || 'Get in touch'
  const contactEmail = (ctx.config.email as string) || ''
  const contactInfo =
    contactEmail ||
    (ctx.tokens.textSlots.about_paragraph
      ? ctx.tokens.textSlots.about_paragraph
      : '')
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)
  const submitLabel = (ctx.config.submitLabel as string) || 'Send message'

  return {
    jsx: `
      <section
        className="bg-background border-y border-border"
        aria-label="Contact us"
      >
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-2xl mx-auto ${motion}">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground font-[family-name:var(--font-display)] mb-3 text-center">
              ${headline}
            </h2>
            ${
              contactInfo
                ? `<p className="text-muted-foreground text-sm md:text-base leading-relaxed text-center mb-8 max-w-md mx-auto">
              ${contactInfo}
            </p>`
                : '<div className="mb-8" />'
            }
            <form
              onSubmit={e => e.preventDefault()}
              className="flex flex-col gap-5"
              aria-label="Contact form"
            >
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-name" className="text-sm font-medium text-foreground">
                    Full name
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    name="name"
                    autoComplete="name"
                    placeholder="Jane Smith"
                    required
                    className="rounded-[${radius}] border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-email" className="text-sm font-medium text-foreground">
                    Email address
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="jane@example.com"
                    required
                    className="rounded-[${radius}] border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="contact-message" className="text-sm font-medium text-foreground">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={5}
                  placeholder="Tell us how we can help…"
                  required
                  className="rounded-[${radius}] border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-[${radius}] bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 active:scale-95 transition-all"
                >
                  ${submitLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>`,
  }
}
