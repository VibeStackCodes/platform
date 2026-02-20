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
 *   contentFaq                   — native <details> accordion FAQ
 *   contentFeatures              — icon + title + description grid
 *   contentTeam                  — avatar/initials + name + role grid
 */

import type { SectionRenderer, SectionOutput, SectionContext } from './types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Card motion class based on theme motion setting */
function cardMotion(ctx: SectionContext): string {
  if (ctx.tokens.style.motion === 'none') return ''
  return 'transition-all duration-300'
}

/** Card style class derived from theme cardStyle token */
function cardStyle(ctx: SectionContext): string {
  const radius = ctx.tokens.style.borderRadius
  const base = `rounded-[${radius}]`
  if (ctx.tokens.style.cardStyle === 'flat') return base
  if (ctx.tokens.style.cardStyle === 'bordered') return `${base} border border-border`
  if (ctx.tokens.style.cardStyle === 'glass')
    return `${base} border border-border/70 bg-card/70 backdrop-blur-md`
  // elevated (default)
  return `${base} border border-border shadow-sm`
}

/** Typed array coercion — extracts a typed array from config or returns [] */
function configArray<T>(ctx: SectionContext, key: string): T[] {
  const val = ctx.config[key]
  if (Array.isArray(val)) return val as T[]
  return []
}

// ---------------------------------------------------------------------------
// Testimonial data types (internal)
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
  const radius = ctx.tokens.style.borderRadius
  const motion = cardMotion(ctx)
  const headline = (ctx.config.headline as string) || `Featured ${entityTitle}`

  const imageBlock = imageCol
    ? `
          {!!featured.${imageCol} && (
            <img
              src={String(featured.${imageCol})}
              alt={String(featured.${displayCol} ?? '')}
              className="w-full h-64 md:h-80 object-cover rounded-t-[${radius}]"
            />
          )}`
    : ''

  return {
    jsx: `
      <section className="py-16 px-4" aria-label="Featured ${entityTitle}">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-8">
            ${headline}
          </h2>

          {featured ? (
            <div className="max-w-3xl ${cardStyle(ctx)} ${motion} overflow-hidden bg-card">
              ${imageBlock}
              <div className="p-6 md:p-8 flex flex-col gap-4">
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
              </div>
            </div>
          ) : (
            <div className="${cardStyle(ctx)} p-8 bg-muted/30 text-center text-muted-foreground">
              No featured item found.
            </div>
          )}
        </div>
      </section>`,
    imports: [
      "import { useQuery } from '@tanstack/react-query'",
      "import { supabase } from '@/lib/supabase'",
      "import { Link } from '@tanstack/react-router'",
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
  const motion = cardMotion(ctx)
  const items = configArray<TestimonialItem>(ctx, 'testimonials')

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
    .map(
      (t) => `
            <div
              className="snap-center shrink-0 w-[280px] sm:w-[320px] ${cardStyle(ctx)} ${motion} p-6 bg-card flex flex-col gap-4"
            >
              <span className="text-5xl leading-none text-primary/30 font-serif select-none" aria-hidden="true">
                &ldquo;
              </span>
              <blockquote className="text-foreground text-sm leading-relaxed flex-1">
                ${t.quote}
              </blockquote>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                — ${t.author}
              </p>
            </div>`,
    )
    .join('\n')

  return {
    jsx: `
      <section className="py-16 px-4" aria-label="Testimonials">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-8 text-center">
            What people are saying
          </h2>
          <div
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 scroll-smooth"
            role="list"
            aria-label="Testimonial quotes"
          >
            ${cards}
          </div>
        </div>
      </section>`,
  }
}

// ---------------------------------------------------------------------------
// 3. contentTestimonialsWall — grid of testimonial quote cards
// ---------------------------------------------------------------------------

export const contentTestimonialsWall: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const motion = cardMotion(ctx)
  const items = configArray<TestimonialItem>(ctx, 'testimonials')

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
    .map((t, _i) => {
      const initial = t.author.charAt(0).toUpperCase()
      return `
            <div
              className="${cardStyle(ctx)} ${motion} p-6 bg-card flex flex-col gap-4"
              role="listitem"
            >
              <span className="text-4xl leading-none text-primary/25 font-serif select-none" aria-hidden="true">
                &ldquo;
              </span>
              <blockquote className="text-foreground text-sm leading-relaxed flex-1">
                ${t.quote}
              </blockquote>
              <div className="flex items-center gap-3 pt-2">
                <div
                  className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0"
                  aria-hidden="true"
                >
                  ${initial}
                </div>
                <p className="text-xs font-semibold text-muted-foreground">
                  ${t.author}
                </p>
              </div>
            </div>`
    })
    .join('\n')

  return {
    jsx: `
      <section className="py-16 px-4 bg-muted/20" aria-label="Testimonials">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-10 text-center">
            Trusted by people like you
          </h2>
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            role="list"
            aria-label="Testimonial wall"
          >
            ${cards}
          </div>
        </div>
      </section>`,
  }
}

// ---------------------------------------------------------------------------
// 4. contentStats — 4-box statistics counter bar
// ---------------------------------------------------------------------------

export const contentStats: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const motion = cardMotion(ctx)
  const items = configArray<StatItem>(ctx, 'stats')

  const stats: StatItem[] =
    items.length > 0
      ? items
      : [
          { label: 'Users', value: '10K+' },
          { label: 'Items', value: '500+' },
          { label: 'Rating', value: '4.9' },
          { label: 'Uptime', value: '99.9%' },
        ]

  const boxes = stats
    .map(
      (s) => `
          <div
            className="flex flex-col items-center gap-1 px-6 py-8 ${motion}"
            role="listitem"
          >
            <span className="text-4xl md:text-5xl font-bold text-foreground font-[family-name:var(--font-display)]">
              ${s.value}
            </span>
            <span className="text-sm text-muted-foreground uppercase tracking-widest">
              ${s.label}
            </span>
          </div>`,
    )
    .join('\n')

  return {
    jsx: `
      <section className="py-12 px-4 bg-muted/50" aria-label="Statistics">
        <div className="max-w-7xl mx-auto">
          <div
            className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border"
            role="list"
            aria-label="${ctx.appName} statistics"
          >
            ${boxes}
          </div>
        </div>
      </section>`,
  }
}

// ---------------------------------------------------------------------------
// 5. contentTimeline — vertical alternating-sides timeline
// ---------------------------------------------------------------------------

export const contentTimeline: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const radius = ctx.tokens.style.borderRadius
  const motion = cardMotion(ctx)
  const items = configArray<MilestoneItem>(ctx, 'milestones')

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

  const items_jsx = milestones
    .map((m, i) => {
      const isLeft = i % 2 === 0
      return `
          {/* Milestone ${i + 1} — ${isLeft ? 'left' : 'right'} */}
          <div className="relative flex items-start ${isLeft ? 'md:flex-row' : 'md:flex-row-reverse'} flex-row gap-6 md:gap-0">
            {/* Timeline dot */}
            <div className="absolute left-4 md:left-1/2 top-3 -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background z-10 shrink-0" aria-hidden="true" />

            {/* Spacer for opposite side on desktop */}
            <div className="hidden md:block flex-1" />

            {/* Content card */}
            <div className="ml-12 md:ml-0 md:w-5/12 ${cardStyle(ctx)} ${motion} p-5 bg-card ${isLeft ? 'md:mr-8' : 'md:ml-8'}">
              <span className="inline-block text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-[${radius}] mb-2">
                ${m.date}
              </span>
              <h3 className="text-base font-bold text-foreground mb-1">
                ${m.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                ${m.description}
              </p>
            </div>
          </div>`
    })
    .join('\n')

  return {
    jsx: `
      <section className="py-16 px-4" aria-label="Our story timeline">
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
  }
}

// ---------------------------------------------------------------------------
// 6. contentFaq — native <details> accordion FAQ
// ---------------------------------------------------------------------------

export const contentFaq: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const items = configArray<FaqItem>(ctx, 'faqs')

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
            answer: 'Create an account, follow the onboarding steps, and you\'ll be up and running in minutes. No technical expertise required.',
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

  const entries = faqs
    .map(
      (f, _i) => `
          <details
            className="group border-b border-border last:border-b-0"
            name="faq-${ctx.appName.toLowerCase().replace(/\s+/g, '-')}"
          >
            <summary
              className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none font-semibold text-foreground hover:text-primary transition-colors"
              aria-expanded="false"
            >
              <span>${f.question}</span>
              <span
                className="shrink-0 text-muted-foreground group-open:rotate-45 transition-transform duration-200"
                aria-hidden="true"
              >
                +
              </span>
            </summary>
            <div className="pb-4 text-sm text-muted-foreground leading-relaxed">
              ${f.answer}
            </div>
          </details>`,
    )
    .join('\n')

  return {
    jsx: `
      <section className="py-16 px-4" aria-label="Frequently asked questions">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-10 text-center">
            Frequently Asked Questions
          </h2>
          <div className="rounded-[${ctx.tokens.style.borderRadius}] border border-border bg-card divide-y divide-border overflow-hidden px-6">
            ${entries}
          </div>
        </div>
      </section>`,
  }
}

// ---------------------------------------------------------------------------
// 7. contentFeatures — feature icons grid (marketing/SaaS style)
// ---------------------------------------------------------------------------

export const contentFeatures: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const motion = cardMotion(ctx)
  const items = configArray<FeatureItem>(ctx, 'features')

  // Distinct accent colors for icon blobs (rotated modulo count)
  const COLORS = ['bg-primary/15', 'bg-accent/20', 'bg-muted', 'bg-secondary/20', 'bg-primary/10', 'bg-accent/15']

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

  const cards = features
    .map((f, i) => {
      const color = COLORS[i % COLORS.length]
      const initial = f.title.charAt(0).toUpperCase()
      return `
            <div
              className="${cardStyle(ctx)} ${motion} p-6 bg-card flex flex-col gap-3"
              role="listitem"
            >
              <div
                className="w-10 h-10 ${color} rounded-[${ctx.tokens.style.borderRadius}] flex items-center justify-center text-primary font-bold text-sm shrink-0"
                aria-hidden="true"
              >
                ${initial}
              </div>
              <h3 className="text-base font-bold text-foreground">
                ${f.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                ${f.description}
              </p>
            </div>`
    })
    .join('\n')

  return {
    jsx: `
      <section className="py-16 px-4" aria-label="Features">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-3">
              Why choose ${ctx.appName}?
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Everything you need to get the job done, beautifully packaged in one place.
            </p>
          </div>
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            role="list"
            aria-label="${ctx.appName} feature highlights"
          >
            ${cards}
          </div>
        </div>
      </section>`,
  }
}

// ---------------------------------------------------------------------------
// 8. contentTeam — team member avatar + name + role grid
// ---------------------------------------------------------------------------

export const contentTeam: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const motion = cardMotion(ctx)
  const items = configArray<TeamMember>(ctx, 'team')

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
            <div
              className="flex flex-col items-center gap-3 text-center ${motion}"
              role="listitem"
            >
              {/* Avatar circle with initials fallback */}
              <div
                className="w-20 h-20 rounded-full bg-primary/10 border-2 border-border flex items-center justify-center text-primary font-bold text-xl shrink-0"
                aria-label="${m.name}"
              >
                ${initials}
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">${m.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">${m.role}</p>
              </div>
            </div>`
    })
    .join('\n')

  return {
    jsx: `
      <section className="py-16 px-4" aria-label="Meet the team">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground font-[family-name:var(--font-display)] mb-10 text-center">
            Meet the Team
          </h2>
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
            role="list"
            aria-label="${ctx.appName} team members"
          >
            ${cards}
          </div>
        </div>
      </section>`,
  }
}
