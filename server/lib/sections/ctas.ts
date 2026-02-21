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
 *
 * shadcn components used:
 *   Input, Label, Button, Card/CardContent/CardFooter/CardHeader/CardTitle,
 *   Badge, Separator, (Textarea via shadcn-style classes on raw <textarea>)
 *
 * Lucide icons used:
 *   Mail, ArrowRight, Check, Send
 *
 * Animations:
 *   tw-animate-css — animate-in fade-in slide-in-from-bottom-4, staggered on
 *   pricing cards. All conditioned on ctx.tokens.style.motion !== 'none'.
 */

import type { SectionRenderer, SectionOutput, SectionContext } from './types'
import { animateEntrance, staggerChildren, resolveBg, resolveSpacing } from './primitives'

// ---------------------------------------------------------------------------
// Shared import sets — returned in SectionOutput.imports so the page assembler
// deduplicates and hoists them to the top of the generated .tsx file.
// ---------------------------------------------------------------------------

const IMPORT_BUTTON = "import { Button } from '@/components/ui/button'"
const IMPORT_INPUT = "import { Input } from '@/components/ui/input'"
const IMPORT_LABEL = "import { Label } from '@/components/ui/label'"
const IMPORT_CARD =
  "import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'"
const IMPORT_BADGE = "import { Badge } from '@/components/ui/badge'"
const IMPORT_SEPARATOR = "import { Separator } from '@/components/ui/separator'"
const IMPORT_ICONS_NEWSLETTER = "import { Mail, ArrowRight } from 'lucide-react'"
const IMPORT_ICONS_PRICING = "import { Check, ArrowRight } from 'lucide-react'"
const IMPORT_ICONS_DOWNLOAD = "import { ArrowRight } from 'lucide-react'"
const IMPORT_ICONS_CONTACT = "import { Send } from 'lucide-react'"

// ---------------------------------------------------------------------------
// 1. ctaNewsletter — centered newsletter signup with bg-muted/30 background
// ---------------------------------------------------------------------------

export const ctaNewsletter: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || 'Stay updated'
  const description =
    (ctx.config.description as string) ||
    `Get the latest from ${ctx.appName} delivered to your inbox.`
  const buttonLabel = (ctx.config.buttonLabel as string) || ctx.tokens.textSlots.cta_label
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const entrance = animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700 })
  const entranceClass = entrance ? ` ${entrance}` : ''

  return {
    jsx: `
      <section
        className="${bg} border-y border-border"
        aria-label="Newsletter signup"
      >
        <div className="container mx-auto px-4 ${spacing}">
          <div className="max-w-lg mx-auto text-center${entranceClass}">
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
              <Label htmlFor="newsletter-email" className="sr-only">
                Email address
              </Label>
              <div className="relative flex-1">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  id="newsletter-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  aria-required="true"
                  className="pl-9 focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
              <Button type="submit" size="lg" className="shrink-0 gap-2">
                ${buttonLabel}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </div>
      </section>`,
    imports: [IMPORT_BUTTON, IMPORT_INPUT, IMPORT_LABEL, IMPORT_ICONS_NEWSLETTER],
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
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const entrance = animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700 })
  const entranceClass = entrance ? ` ${entrance}` : ''

  return {
    jsx: `
      <section
        className="border-y border-border ${bg}"
        aria-label="Newsletter signup"
      >
        <div className="container mx-auto px-4 ${spacing}">
          <div className="grid md:grid-cols-2 gap-10 items-center${entranceClass}">

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
                <Label htmlFor="newsletter-split-email" className="sr-only">
                  Email address
                </Label>
                <div className="relative flex-1">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                    aria-hidden="true"
                  />
                  <Input
                    id="newsletter-split-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    aria-required="true"
                    className="pl-9 focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
                <Button type="submit" size="lg" className="shrink-0 gap-2">
                  ${buttonLabel}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </form>
            </div>

          </div>
        </div>
      </section>`,
    imports: [IMPORT_BUTTON, IMPORT_INPUT, IMPORT_LABEL, IMPORT_ICONS_NEWSLETTER],
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
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const headerEntrance = animateEntrance(ctx, {
    direction: 'bottom',
    distance: 4,
    durationMs: 700,
  })
  const headerEntranceClass = headerEntrance ? ` ${headerEntrance}` : ''

  // Stagger delays for pricing card entrances
  const staggerDelays = staggerChildren(plans.length, 0, 150)

  const planCards = plans
    .map((plan, idx) => {
      const delay = staggerDelays[idx] ?? 'delay-0'
      const cardEntrance = animateEntrance(ctx, {
        direction: 'bottom',
        distance: 4,
        durationMs: 600,
      })
      const cardEntranceClass = cardEntrance ? ` ${cardEntrance} ${delay}` : ''

      const highlightClasses = plan.highlighted
        ? 'ring-2 ring-primary shadow-xl scale-[1.02]'
        : 'hover:shadow-xl transition-shadow'

      const featureItems = plan.features
        .map(
          (f) => `
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="size-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                  <span>${f}</span>
                </li>`,
        )
        .join('')

      const badgeJsx = plan.highlighted
        ? `
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Most popular
              </Badge>`
        : ''

      const buttonVariant = plan.highlighted ? 'default' : 'outline'

      return `
            <Card
              className="relative flex flex-col${cardEntranceClass} ${highlightClasses}"
              ${plan.highlighted ? 'aria-label="Recommended plan"' : ''}
            >
              ${badgeJsx}
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold font-[family-name:var(--font-display)]">
                  ${plan.name}
                </CardTitle>
                <div className="mt-1">
                  <span className="text-3xl font-extrabold text-foreground">${plan.price}</span>
                  ${plan.period ? `<span className="ml-1 text-sm text-muted-foreground">${plan.period}</span>` : ''}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="flex flex-col gap-2 mt-2" aria-label="${plan.name} plan features">
                  ${featureItems}
                </ul>
              </CardContent>
              <CardFooter className="pt-4">
                <Button
                  type="button"
                  variant="${buttonVariant}"
                  size="default"
                  className="w-full gap-2"
                >
                  ${plan.cta}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </CardFooter>
            </Card>`
    })
    .join('')

  return {
    jsx: `
      <section
        className="${bg} border-y border-border"
        aria-label="Pricing plans"
      >
        <div className="container mx-auto px-4 ${spacing}">
          <div className="text-center mb-12${headerEntranceClass}">
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
    imports: [IMPORT_BUTTON, IMPORT_CARD, IMPORT_BADGE, IMPORT_ICONS_PRICING],
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
  const spacing = resolveSpacing(ctx.config)

  const entrance = animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700 })
  const entranceClass = entrance ? ` ${entrance}` : ''

  return {
    jsx: `
      <section
        className="bg-primary text-primary-foreground"
        aria-label="Download or get started"
      >
        <div className="container mx-auto px-4 ${spacing} text-center${entranceClass}">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold font-[family-name:var(--font-display)] mb-4 leading-tight">
            ${headline}
          </h2>
          <p className="text-primary-foreground/80 text-base md:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
            ${subtitle}
          </p>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="gap-2 shadow-sm hover:opacity-90 active:scale-95 transition-all"
          >
            <a href="${buttonHref}">
              ${buttonLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </section>`,
    imports: [IMPORT_BUTTON, IMPORT_ICONS_DOWNLOAD],
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
    (ctx.tokens.textSlots.about_paragraph ? ctx.tokens.textSlots.about_paragraph : '')
  const submitLabel = (ctx.config.submitLabel as string) || 'Send message'
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const entrance = animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 700 })
  const entranceClass = entrance ? ` ${entrance}` : ''

  return {
    jsx: `
      <section
        className="${bg} border-y border-border"
        aria-label="Contact us"
      >
        <div className="container mx-auto px-4 ${spacing}">
          <div className="max-w-2xl mx-auto${entranceClass}">
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
            <Separator className="mb-8" />
            <form
              onSubmit={e => e.preventDefault()}
              className="flex flex-col gap-5"
              aria-label="Contact form"
            >
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contact-name">
                    Full name
                  </Label>
                  <Input
                    id="contact-name"
                    type="text"
                    name="name"
                    autoComplete="name"
                    placeholder="Jane Smith"
                    required
                    aria-required="true"
                    className="focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contact-email">
                    Email address
                  </Label>
                  <Input
                    id="contact-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="jane@example.com"
                    required
                    aria-required="true"
                    className="focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact-subject">
                  Subject
                </Label>
                <Input
                  id="contact-subject"
                  type="text"
                  name="subject"
                  placeholder="How can we help?"
                  required
                  aria-required="true"
                  className="focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact-message">
                  Message
                </Label>
                <textarea
                  id="contact-message"
                  name="message"
                  rows={5}
                  placeholder="Tell us how we can help…"
                  required
                  aria-required="true"
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="lg" className="gap-2">
                  ${submitLabel}
                  <Send className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>`,
    imports: [IMPORT_BUTTON, IMPORT_INPUT, IMPORT_LABEL, IMPORT_SEPARATOR, IMPORT_ICONS_CONTACT],
  }
}
