/**
 * Content Block Section Renderers (8)
 *
 * Each renderer is a pure function (SectionContext) => SectionOutput producing
 * a self-contained JSX fragment string. Content blocks are mostly static or
 * semi-static sections used on homepages and landing pages. They rely on
 * ctx.appName, ctx.tokens, and ctx.config for their data — not live DB queries
 * (except contentFeatured, which requires an entity binding).
 *
 * Visual taxonomy:
 *   contentFeatured              — entity spotlight, single large card
 *   contentTestimonialsCarousel  — horizontal scrolling quote cards
 *   contentTestimonialsWall      — 3-column grid of quote cards
 *   contentStats                 — 4-box statistics/counter bar
 *   contentTimeline              — vertical alternating-sides timeline
 *   contentFaq                   — shadcn Accordion FAQ
 *   contentFeatures              — Lucide icon + title + description grid
 *   contentTeam                  — Avatar/initials + name + role grid
 *
 * Upgrade notes (v2):
 *   - All cards use shadcn <Card> / <CardContent>
 *   - contentFeatured adds <Badge> for category + <Skeleton> loading state
 *   - Testimonials use <Avatar> with <AvatarFallback> initials + <Quote> icon
 *   - contentStats adds tw-animate-css staggered entrance animations
 *   - contentTimeline adds tw-animate-css staggered slide-in animations
 *   - contentFaq replaces <details>/<summary> with shadcn <Accordion>
 *   - contentFeatures replaces letter blobs with Lucide icons + stagger animations
 *   - contentTeam uses <Avatar className="size-20"> with <Card> wrapper
 */

import type { SectionRenderer, SectionOutput, SectionContext } from './types'
import { animateEntrance, staggerChildren, cardHoverClass, cardClasses, resolveBg, resolveSpacing } from './primitives'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Card motion class based on theme motion setting */
function cardMotion(ctx: SectionContext): string {
  if (ctx.tokens.style.motion === 'none') return ''
  return 'transition-all duration-300'
}

/** Typed array coercion — extracts a typed array from config or returns [] */
function configArray<T>(ctx: SectionContext, key: string): T[] {
  const val = ctx.config[key]
  if (Array.isArray(val)) return val as T[]
  return []
}

// ---------------------------------------------------------------------------
// Internal data types
// ---------------------------------------------------------------------------

interface TestimonialItem {
  quote: string
  author: string
}

interface StatItem {
  label: string
  value: string
}

interface MilestoneItem {
  date: string
  title: string
  description: string
}

interface FaqItem {
  question: string
  answer: string
}

interface FeatureItem {
  title: string
  description: string
  color?: string
}

interface TeamMember {
  name: string
  role: string
}

// ---------------------------------------------------------------------------
// 1. contentFeatured — entity spotlight, single featured card with image
// ---------------------------------------------------------------------------

export const contentFeatured: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const table = ctx.tableName ?? 'items'
  const displayCol = ctx.displayColumn ?? 'name'
  const imageCol = ctx.imageColumn ?? null
  const entityTitle = ctx.entityName ?? 'Featured'
  const motion = cardMotion(ctx)
  const hover = cardHoverClass(ctx)
  const cardCls = cardClasses(ctx)
  const headline = (ctx.config.headline as string) || `Featured ${entityTitle}`
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const imageBlock = imageCol
    ? `
          {!!featured.${imageCol} && (
            <img
              src={String(featured.${imageCol})}
              alt={String(featured.${displayCol} ?? '')}
              className="w-full h-64 md:h-80 object-cover rounded-t-lg"
            />
          )}`
    : ''

  return {
    jsx: `
      <section className="${spacing} px-4 ${bg}" aria-label="Featured ${entityTitle}">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-8">
            ${headline}
          </h2>

          {featured === undefined ? (
            <div className="max-w-3xl">
              <Card className="overflow-hidden">
                <Skeleton className="h-64 md:h-80 w-full rounded-none" />
                <CardContent className="p-6 md:p-8 flex flex-col gap-4">
                  <Skeleton className="h-7 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-1/3" />
                </CardContent>
              </Card>
            </div>
          ) : featured ? (
            <div className="max-w-3xl">
              <Card className={\`overflow-hidden ${motion} ${hover} ${cardCls}\`}>
                ${imageBlock}
                <CardContent className="p-6 md:p-8 flex flex-col gap-4">
                  {!!featured.category && (
                    <Badge variant="secondary" className="w-fit">
                      {String(featured.category)}
                    </Badge>
                  )}
                  <h3 className="text-xl md:text-2xl font-bold text-foreground">
                    {String(featured.${displayCol} ?? '')}
                  </h3>
                  {!!featured.excerpt && (
                    <p className="text-muted-foreground leading-relaxed line-clamp-4">
                      {String(featured.excerpt)}
                    </p>
                  )}
                  {!featured.excerpt && !!featured.description && (
                    <p className="text-muted-foreground leading-relaxed line-clamp-4">
                      {String(featured.description)}
                    </p>
                  )}
                  <div className="pt-2">
                    <Link
                      to={\`/${ctx.entitySlug ?? table}/\${featured.id}\`}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                    >
                      View {String(featured.${displayCol} ?? '')}
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="max-w-3xl">
              <CardContent className="p-8 text-center text-muted-foreground">
                No featured item found.
              </CardContent>
            </Card>
          )}
        </div>
      </section>`,
    imports: [
      "import { useQuery } from '@tanstack/react-query'",
      "import { supabase } from '@/lib/supabase'",
      "import { Link } from '@tanstack/react-router'",
      "import { Card, CardContent } from '@/components/ui/card'",
      "import { Badge } from '@/components/ui/badge'",
      "import { Skeleton } from '@/components/ui/skeleton'",
    ],
    hooks: [
      `const { data: featured } = useQuery({
    queryKey: ['${table}', 'featured'],
    queryFn: async () => {
      const { data } = await supabase
        .from('${table}')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
  })`,
    ],
  }
}

// ---------------------------------------------------------------------------
// 2. contentTestimonialsCarousel — horizontal snap-scroll testimonial quotes
// ---------------------------------------------------------------------------

export const contentTestimonialsCarousel: SectionRenderer = (
  ctx: SectionContext,
): SectionOutput => {
  const items = configArray<TestimonialItem>(ctx, 'testimonials')
  const hover = cardHoverClass(ctx)
  const cardCls = cardClasses(ctx)
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const testimonials: TestimonialItem[] =
    items.length > 0
      ? items
      : [
          {
            quote: `${ctx.appName} completely transformed the way our team works together.`,
            author: 'Alex M.',
          },
          {
            quote: `The best tool we've added to our workflow — fast, reliable, and easy to use.`,
            author: 'Jordan K.',
          },
          {
            quote: `I can't imagine going back to how we worked before ${ctx.appName}. Game changer.`,
            author: 'Sam R.',
          },
        ]

  const cards = testimonials
    .map((t) => {
      const initial = t.author.charAt(0).toUpperCase()
      return `
            <li className="snap-center shrink-0 w-[280px] sm:w-[320px]">
              <Card className={\`h-full shadow-lg hover:shadow-xl ${hover} ${cardCls}\`}>
                <CardContent className="p-6 flex flex-col gap-4 h-full">
                  <Quote className="size-8 text-primary/30" aria-hidden="true" />
                  <blockquote className="text-foreground text-sm leading-relaxed flex-1">
                    ${t.quote}
                  </blockquote>
                  <div className="flex items-center gap-3 pt-2">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                        ${initial}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-xs font-semibold text-muted-foreground">
                      ${t.author}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>`
    })
    .join('\n')

  return {
    jsx: `
      <section className="${spacing} px-4 ${bg}" aria-label="Testimonials">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Quote className="size-6 text-primary/60" aria-hidden="true" />
            <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] text-center">
              What people are saying
            </h2>
          </div>
          <ul
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 scroll-smooth list-none"
            aria-label="Testimonial quotes"
          >
            ${cards}
          </ul>
        </div>
      </section>`,
    imports: [
      "import { Card, CardContent } from '@/components/ui/card'",
      "import { Avatar, AvatarFallback } from '@/components/ui/avatar'",
      "import { Quote } from 'lucide-react'",
    ],
  }
}

// ---------------------------------------------------------------------------
// 3. contentTestimonialsWall — grid of testimonial quote cards
// ---------------------------------------------------------------------------

export const contentTestimonialsWall: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const items = configArray<TestimonialItem>(ctx, 'testimonials')
  const hover = cardHoverClass(ctx)
  const cardCls = cardClasses(ctx)
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const testimonials: TestimonialItem[] =
    items.length > 0
      ? items
      : [
          {
            quote: `${ctx.appName} is exactly what we needed. Intuitive, powerful, and well-designed.`,
            author: 'Riley D.',
          },
          {
            quote: `Setup was fast and the results were immediate. Highly recommend ${ctx.appName}.`,
            author: 'Morgan T.',
          },
          {
            quote: `Our customers notice the difference since we switched to ${ctx.appName}.`,
            author: 'Taylor V.',
          },
          {
            quote: `Outstanding support and an even better product. ${ctx.appName} delivers.`,
            author: 'Casey B.',
          },
          {
            quote: `We evaluated several options — ${ctx.appName} was the clear winner.`,
            author: 'Drew L.',
          },
          {
            quote: `Five stars. The attention to detail in ${ctx.appName} is remarkable.`,
            author: 'Quinn A.',
          },
        ]

  const cards = testimonials
    .map((t) => {
      const initial = t.author.charAt(0).toUpperCase()
      return `
            <li role="listitem">
              <Card className={\`h-full shadow-lg hover:shadow-xl rounded-xl ${hover} ${cardCls}\`}>
                <CardContent className="p-6 flex flex-col gap-4 h-full">
                  <Quote className="size-6 text-primary/25" aria-hidden="true" />
                  <blockquote className="text-foreground text-sm leading-relaxed flex-1">
                    ${t.quote}
                  </blockquote>
                  <div className="flex items-center gap-3 pt-2">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                        ${initial}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-xs font-semibold text-muted-foreground">
                      ${t.author}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>`
    })
    .join('\n')

  return {
    jsx: `
      <section className="${spacing} px-4 ${bg}" aria-label="Testimonials">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-10">
            <Quote className="size-6 text-primary/60" aria-hidden="true" />
            <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] text-center">
              Trusted by people like you
            </h2>
          </div>
          <ul
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 list-none"
            aria-label="Testimonial wall"
          >
            ${cards}
          </ul>
        </div>
      </section>`,
    imports: [
      "import { Card, CardContent } from '@/components/ui/card'",
      "import { Avatar, AvatarFallback } from '@/components/ui/avatar'",
      "import { Quote } from 'lucide-react'",
    ],
  }
}

// ---------------------------------------------------------------------------
// 4. contentStats — 4-box statistics counter bar with staggered entrance
// ---------------------------------------------------------------------------

export const contentStats: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const items = configArray<StatItem>(ctx, 'stats')
  const delays = staggerChildren(4, 0, 100)
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const stats: StatItem[] =
    items.length > 0
      ? items
      : [
          { label: 'Users', value: '10K+' },
          { label: 'Items', value: '500+' },
          { label: 'Rating', value: '4.9' },
          { label: 'Uptime', value: '99.9%' },
        ]

  // Pre-compute animation classes for up to 4 stat boxes
  const animCls = stats.map((_, i) => {
    const base = animateEntrance(ctx, { durationMs: 500 })
    return base ? `${base} ${delays[i] ?? 'delay-0'}` : ''
  })

  const boxes = stats
    .map((s, i) => {
      const anim = animCls[i] ?? ''
      return `
            <li role="listitem">
              <Card className={\`h-full border-0 shadow-none rounded-none bg-transparent\`}>
                <CardContent className={\`flex flex-col items-center gap-1 px-6 py-8 ${anim}\`}>
                  <span className="text-4xl md:text-5xl font-bold text-foreground font-[family-name:var(--font-display)]">
                    ${s.value}
                  </span>
                  <span className="text-sm text-muted-foreground uppercase tracking-widest">
                    ${s.label}
                  </span>
                </CardContent>
              </Card>
            </li>`
    })
    .join('\n')

  return {
    jsx: `
      <section className="${spacing} px-4 ${bg}" aria-label="Statistics">
        <div className="max-w-7xl mx-auto">
          <ul
            className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border list-none"
            aria-label="${ctx.appName} statistics"
          >
            ${boxes}
          </ul>
        </div>
      </section>`,
    imports: [
      "import { Card, CardContent } from '@/components/ui/card'",
    ],
  }
}

// ---------------------------------------------------------------------------
// 5. contentTimeline — vertical alternating-sides timeline with stagger
// ---------------------------------------------------------------------------

export const contentTimeline: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const items = configArray<MilestoneItem>(ctx, 'milestones')
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const milestones: MilestoneItem[] =
    items.length > 0
      ? items
      : [
          {
            date: '2020',
            title: 'Founded',
            description: `${ctx.appName} was created with a simple vision: build something that actually helps people.`,
          },
          {
            date: '2021',
            title: 'First Milestone',
            description: 'Reached our first 1,000 users and launched key features based on their feedback.',
          },
          {
            date: '2022',
            title: 'Rapid Growth',
            description: `${ctx.appName} expanded its feature set and onboarded enterprise partners.`,
          },
          {
            date: '2024',
            title: 'Today',
            description: `Continuing to grow and improve ${ctx.appName} for users around the world.`,
          },
        ]

  const delays = staggerChildren(milestones.length, 0, 150)

  const items_jsx = milestones
    .map((m, i) => {
      const isLeft = i % 2 === 0
      const anim = animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 500 })
      const animWithDelay = anim ? `${anim} ${delays[i] ?? 'delay-0'}` : ''

      return `
          {/* Milestone ${i + 1} — ${isLeft ? 'left' : 'right'} */}
          <div className="relative flex items-start ${isLeft ? 'md:flex-row' : 'md:flex-row-reverse'} flex-row gap-6 md:gap-0">
            {/* Timeline dot */}
            <div className="absolute left-4 md:left-1/2 top-4 -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background z-10 shrink-0" aria-hidden="true" />

            {/* Spacer for opposite side on desktop */}
            <div className="hidden md:block flex-1" />

            {/* Content card */}
            <div className="ml-12 md:ml-0 md:w-5/12 ${isLeft ? 'md:mr-8' : 'md:ml-8'} ${animWithDelay}">
              <Card className="shadow-md">
                <CardContent className="p-5 flex flex-col gap-2">
                  <Badge variant="secondary" className="w-fit text-xs font-bold">
                    ${m.date}
                  </Badge>
                  <h3 className="text-base font-bold text-foreground">
                    ${m.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    ${m.description}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>`
    })
    .join('\n')

  return {
    jsx: `
      <section className="${spacing} px-4 ${bg}" aria-label="Our story timeline">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-12 text-center">
            Our Journey
          </h2>

          {/* Timeline track */}
          <div className="relative">
            {/* Vertical line */}
            <div
              className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-border -translate-x-px"
              aria-hidden="true"
            />

            {/* Milestone cards */}
            <div className="flex flex-col gap-10">
              ${items_jsx}
            </div>
          </div>
        </div>
      </section>`,
    imports: [
      "import { Card, CardContent } from '@/components/ui/card'",
      "import { Badge } from '@/components/ui/badge'",
    ],
  }
}

// ---------------------------------------------------------------------------
// 6. contentFaq — shadcn Accordion FAQ (replaces native <details>/<summary>)
// ---------------------------------------------------------------------------

export const contentFaq: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const items = configArray<FaqItem>(ctx, 'faqs')
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const faqs: FaqItem[] =
    items.length > 0
      ? items
      : [
          {
            question: `What is ${ctx.appName}?`,
            answer: `${ctx.appName} is a modern web application designed to help you manage and explore your data with a clean, intuitive interface.`,
          },
          {
            question: `How do I get started with ${ctx.appName}?`,
            answer: "Create an account, follow the onboarding steps, and you'll be up and running in minutes. No technical expertise required.",
          },
          {
            question: `Is ${ctx.appName} suitable for teams?`,
            answer: 'Yes — collaboration is built in. Invite teammates, assign roles, and work together seamlessly within the same workspace.',
          },
          {
            question: `How do I get support for ${ctx.appName}?`,
            answer: `Reach out via the contact page or email our support team. We typically respond within one business day.`,
          },
        ]

  const accordionItems = faqs
    .map(
      (f, i) => `
          <AccordionItem value="faq-${i}">
            <AccordionTrigger className="text-left font-semibold text-foreground hover:text-primary">
              ${f.question}
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
              ${f.answer}
            </AccordionContent>
          </AccordionItem>`,
    )
    .join('\n')

  return {
    jsx: `
      <section className="${spacing} px-4 ${bg}" aria-label="Frequently asked questions">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-10 text-center">
            Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="w-full">
            ${accordionItems}
          </Accordion>
        </div>
      </section>`,
    imports: [
      "import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'",
    ],
  }
}

// ---------------------------------------------------------------------------
// 7. contentFeatures — Lucide icon + title + description grid with stagger
// ---------------------------------------------------------------------------

// Rotating set of Lucide icon names for feature cards
const FEATURE_ICONS = ['Zap', 'Shield', 'Clock', 'Sparkles', 'Settings', 'Headphones'] as const
type FeatureIcon = (typeof FEATURE_ICONS)[number]

export const contentFeatures: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const items = configArray<FeatureItem>(ctx, 'features')
  const hover = cardHoverClass(ctx)
  const cardCls = cardClasses(ctx)
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const features: FeatureItem[] =
    items.length > 0
      ? items
      : [
          { title: 'Fast & Reliable', description: `${ctx.appName} is built for performance — lightning-fast responses every time.` },
          { title: 'Easy to Use', description: 'An intuitive interface means your team gets productive from day one.' },
          { title: 'Secure by Default', description: 'Enterprise-grade security keeps your data safe without extra configuration.' },
          { title: 'Real-time Updates', description: 'See changes instantly. No manual refreshes, no stale data.' },
          { title: 'Fully Customizable', description: 'Tailor every aspect of the experience to match your workflow.' },
          { title: 'Great Support', description: `The ${ctx.appName} team is here when you need us — fast responses guaranteed.` },
        ]

  const delays = staggerChildren(features.length, 0, 100)
  // Collect only the icons actually needed (deduplicated by index mod)
  const usedIconIndices = features.map((_, i) => i % FEATURE_ICONS.length)
  const uniqueIcons: FeatureIcon[] = [...new Set(usedIconIndices)].map(
    (idx) => FEATURE_ICONS[idx],
  )

  const cards = features
    .map((f, i) => {
      const icon: FeatureIcon = FEATURE_ICONS[i % FEATURE_ICONS.length]
      const anim = animateEntrance(ctx, { direction: 'bottom', distance: 4, durationMs: 500 })
      const animWithDelay = anim ? `${anim} ${delays[i] ?? 'delay-0'}` : ''

      return `
            <li role="listitem" className="${animWithDelay}">
              <Card className={\`h-full ${hover} ${cardCls}\`}>
                <CardContent className="p-6 flex flex-col gap-3">
                  <div
                    className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0"
                    aria-hidden="true"
                  >
                    <${icon} className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    ${f.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    ${f.description}
                  </p>
                </CardContent>
              </Card>
            </li>`
    })
    .join('\n')

  const iconImport = `import { ${uniqueIcons.join(', ')} } from 'lucide-react'`

  return {
    jsx: `
      <section className="${spacing} px-4 ${bg}" aria-label="Features">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-3">
              Why choose ${ctx.appName}?
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Everything you need to get the job done, beautifully packaged in one place.
            </p>
          </div>
          <ul
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 list-none"
            aria-label="${ctx.appName} feature highlights"
          >
            ${cards}
          </ul>
        </div>
      </section>`,
    imports: [
      "import { Card, CardContent } from '@/components/ui/card'",
      iconImport,
    ],
  }
}

// ---------------------------------------------------------------------------
// 8. contentTeam — Avatar + name + role, each wrapped in a Card
// ---------------------------------------------------------------------------

export const contentTeam: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const items = configArray<TeamMember>(ctx, 'team')
  const hover = cardHoverClass(ctx)
  const cardCls = cardClasses(ctx)
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const members: TeamMember[] =
    items.length > 0
      ? items
      : [
          { name: 'Alex Johnson', role: 'Co-Founder & CEO' },
          { name: 'Sam Rivera', role: 'Head of Product' },
          { name: 'Jordan Kim', role: 'Lead Engineer' },
          { name: 'Morgan Chen', role: 'Design Lead' },
        ]

  const cards = members
    .map((m) => {
      // Generate initials from first + last name words
      const words = m.name.trim().split(/\s+/)
      const initials =
        words.length >= 2
          ? `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`.toUpperCase()
          : words[0].charAt(0).toUpperCase()

      return `
            <li role="listitem">
              <Card className={\`h-full ${hover} ${cardCls}\`}>
                <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
                  <Avatar className="size-20">
                    <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
                      ${initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-foreground text-sm">${m.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">${m.role}</p>
                  </div>
                </CardContent>
              </Card>
            </li>`
    })
    .join('\n')

  return {
    jsx: `
      <section className="${spacing} px-4 ${bg}" aria-label="Meet the team">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-10 text-center">
            Meet the Team
          </h2>
          <ul
            className="grid grid-cols-2 md:grid-cols-4 gap-6 list-none"
            aria-label="${ctx.appName} team members"
          >
            ${cards}
          </ul>
        </div>
      </section>`,
    imports: [
      "import { Card, CardContent } from '@/components/ui/card'",
      "import { Avatar, AvatarFallback } from '@/components/ui/avatar'",
    ],
  }
}
