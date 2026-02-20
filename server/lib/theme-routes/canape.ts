/**
 * Canape Theme Route Generators
 *
 * Produces 1:1 visual clones of the Canape WordPress theme
 * - Public routes: homepage, menu, news, pages, reservations
 * - Admin routes: CRUD forms for all content types
 * - Styling: Serif fonts, max-w-4xl containers, py-16 spacing
 */

import type { RouteMetaLite } from '../theme-layouts'

// ============================================================================
// TYPES
// ============================================================================

interface CanapeRouteContext {
  appName: string
  allPublicMeta: RouteMetaLite[]
  siteEmail?: string
  heroImages: Array<{ url: string; alt: string; photographer: string }>
  hasAuth: boolean
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================

// Sidebar components - rendered on most pages
function renderSidebar(): string {
  return `
      <aside className="space-y-12">
        {/* Hours & Info */}
        <section>
          <h3 className="text-lg font-serif font-bold mb-3">Hours & Info</h3>
          <a
            href="https://maps.google.com/maps?z=16&q=restaurant+address"
            className="text-blue-600 hover:underline block mb-3"
          >
            123 Restaurant Street<br />City, State 12345
          </a>
          <p className="text-gray-700 mb-2">1-555-123-4567</p>
          <p className="text-sm text-gray-700">
            <strong>Lunch:</strong> 11am - 2pm<br />
            <strong>Dinner:</strong> M-Th 5pm - 11pm<br />Fri-Sat: 5pm - 1am
          </p>
        </section>

        {/* Reservations */}
        <section>
          <h3 className="text-lg font-serif font-bold mb-3">Reservations</h3>
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 w-full">
            Make a Reservation
          </button>
        </section>

        {/* About */}
        <section>
          <h3 className="text-lg font-serif font-bold mb-3">About</h3>
          <p className="text-sm text-gray-700">
            Canapé is a bold and refined theme, designed to help you create a beautiful
            online presence for your restaurant. Integrated with food menus, testimonials,
            and the Open Table widget, it's the perfect choice for any food-related business.
          </p>
        </section>
      </aside>
  `
}

function renderFooter(): string {
  return `
      <footer className="border-t mt-16 py-8 text-center text-sm text-gray-700">
        <p>{appName}</p>
        <p>A bold and refined restaurant theme</p>
      </footer>
  `
}

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

/**
 * Homepage with featured items, testimonials carousel, services, email signup
 */
export function renderCanapeHomepage(
  meta: RouteMetaLite[][0],
  context: CanapeRouteContext
): string {
  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

export const Route = createFileRoute('/')({
  component: Home
})

function imageryFallback(url?: string | null, seed?: number): string {
  if (url) return url
  return \`https://picsum.photos/seed/canape-\${seed ?? Math.floor(Math.random() * 1000)}/1200/800\`
}

function Home() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  // Fetch featured entities
  const { data: featured } = useQuery({
    queryKey: ['entities', 'featured'],
    queryFn: async () => {
      const { data } = await supabase
        .from('${meta.table}')
        .select('*')
        .limit(3)
      return data
    }
  })

  // Fetch testimonials
  const { data: testimonials } = useQuery({
    queryKey: ['testimonials'],
    queryFn: async () => {
      const { data } = await supabase
        .from('testimonials')
        .select('*')
        .limit(5)
      return data
    }
  })

  // Fetch services
  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data } = await supabase
        .from('services_page')
        .select('*')
        .order('order_index')
      return data
    }
  })

  return (
    <main>
      {/* F1: Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-white focus:text-gray-900 focus:rounded focus:ring-2 focus:ring-blue-500"
      >
        Skip to main content
      </a>

      {/* Navigation Header */}
      <nav className="max-w-4xl mx-auto px-8 py-6 flex justify-between items-center border-b">
        <div className="text-xl font-serif font-bold uppercase tracking-widest">${context.appName}</div>
        <div className="flex gap-6 text-sm uppercase tracking-widest items-center">
          <Link to="/menu" className="hover:underline">Menu</Link>
          <Link to="/news" className="hover:underline">News</Link>
          <Link to="/reservations" className="hover:underline">Reservations</Link>
          ${context.hasAuth ? '<Link to="/auth/login" className="bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-800">Sign in</Link>' : ''}
        </div>
      </nav>

      {/* F12: Hero Section — has text content inside, use role="img" */}
      <div
        role="img"
        aria-label="${context.appName} hero banner"
        className="w-full h-[530px] bg-cover bg-center bg-black/40 flex items-center justify-center"
        style={{
          backgroundImage: \`url('\${imageryFallback(featured?.[0]?.image_url, 1)}')\`,
          backgroundBlendMode: 'overlay'
        }}
      >
        <div className="text-center text-white">
          <h1 className="text-5xl font-serif mb-4">${context.appName}</h1>
          <p className="text-xl">A bold and refined restaurant experience</p>
        </div>
      </div>

      {/* F1: id="main-content" on first content section after hero */}
      <section id="main-content" className="max-w-4xl mx-auto px-8 py-16">
        <h2 className="text-5xl font-serif text-gray-900 mb-4">Welcome</h2>
        <p className="text-lg text-gray-700 leading-relaxed">
          Join us for an unforgettable culinary experience. Our expert chefs create
          exquisite dishes that blend tradition with innovation, paired perfectly with
          our curated selection of wines and beverages.
        </p>
      </section>

      {/* Featured Items Grid */}
      {featured && featured.length > 0 && (
        <section className="max-w-6xl mx-auto px-8 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            {featured.map((item) => (
              <a
                key={item.id}
                href={\`/\${item.slug}\`}
                className="group"
              >
                <img
                  src={imageryFallback(item.image_url)}
                  alt={item.name}
                  className="w-full aspect-square object-cover mb-4 group-hover:opacity-90 transition-opacity"
                />
                <h3 className="text-xl font-serif text-gray-900 mb-2">{item.name}</h3>
                {/* F15: body paragraph text uses text-gray-700 for contrast */}
                <p className="text-gray-700">{item.description}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Testimonials Carousel */}
      {testimonials && testimonials.length > 0 && (
        <TestimonialsCarousel items={testimonials} />
      )}

      {/* Contact Section */}
      <section className="max-w-4xl mx-auto px-8 py-16 text-center">
        <h2 className="text-3xl font-serif text-gray-900 mb-6">Get in Touch</h2>
        <a
          href="mailto:contact@example.com"
          className="text-xl text-blue-600 hover:underline"
        >
          contact@example.com
        </a>
      </section>

      {/* Services List */}
      {services && services.length > 0 && (
        <section className="max-w-4xl mx-auto px-8 py-16">
          <h2 className="text-3xl font-serif text-gray-900 mb-6">Our Services</h2>
          <ul className="space-y-3">
            {services.map((service) => (
              <li key={service.id}>
                <a
                  href={service.url}
                  className="text-blue-600 hover:underline"
                >
                  {service.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Email Subscription */}
      <section className="max-w-4xl mx-auto px-8 py-16 text-center">
        <h3 className="text-2xl font-serif text-gray-900 mb-4">Stay Updated</h3>
        {/* F15: newsletter description is metadata-level, text-gray-700 is fine */}
        <p className="text-gray-700 mb-4">Subscribe to our newsletter for updates and special offers</p>
        {subscribed ? (
          <div className="bg-green-50 border border-green-200 text-green-700 p-6 rounded-lg">
            <p className="text-lg font-semibold">&#10003; Thank you for subscribing!</p>
            <p className="mt-1">We'll keep you posted on new recipes and stories.</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSubscribed(true)
              setEmail('')
            }}
            className="flex flex-col sm:flex-row gap-2 justify-center"
          >
            <label htmlFor="newsletter-email" className="sr-only">Email Address</label>
            <input
              id="newsletter-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email Address"
              className="px-4 py-2 border border-gray-300 rounded flex-1 sm:flex-none"
              required
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Subscribe
            </button>
          </form>
        )}
      </section>

      ${renderFooter()}
    </main>
  )
}

function TestimonialsCarousel({ items }) {
  const [current, setCurrent] = useState(0)

  return (
    <section className="max-w-4xl mx-auto px-8 py-16">
      <h2 className="text-3xl font-serif text-gray-900 mb-8 text-center">What Our Guests Say</h2>

      <div className="bg-gray-50 p-8 rounded-lg mb-6">
        <blockquote className="text-lg text-gray-700 italic mb-4">
          "{items[current].quote}"
        </blockquote>
        <p className="text-gray-900 font-semibold">— {items[current].author_name}</p>
      </div>

      {/* Pagination dots */}
      <div className="flex justify-center gap-2">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={\`w-2 h-2 rounded-full transition \${
              i === current ? 'bg-gray-900' : 'bg-gray-300'
            }\`}
            aria-label={\`Go to testimonial \${i + 1}\`}
          />
        ))}
      </div>
    </section>
  )
}
  `
}

/**
 * Menu archive - displays all menu items grouped by category
 */
export function renderCanapeMenuArchive(_context: CanapeRouteContext): string {
  return `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/menu/')(
  component: MenuArchive
})

function MenuArchive() {
  const { data: categories } = useQuery({
    queryKey: ['menu', 'categories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .order('category')
        .order('name')

      // Group by category
      const grouped = data?.reduce((acc, item) => {
        const existing = acc.find(c => c.name === item.category)
        if (existing) {
          existing.items.push(item)
        } else {
          acc.push({ name: item.category, items: [item] })
        }
        return acc
      }, []) || []

      return grouped
    }
  })

  return (
    <main>
      {/* F1: Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-white focus:text-gray-900 focus:rounded focus:ring-2 focus:ring-blue-500"
      >
        Skip to main content
      </a>

      {/* F12: Decorative hero — role="presentation" aria-hidden="true" */}
      <div
        role="presentation"
        aria-hidden="true"
        className="w-full h-[530px] bg-cover bg-center bg-black/40"
        style={{
          backgroundImage: \`url('https://picsum.photos/1200/600?random=2')\`,
          backgroundBlendMode: 'overlay'
        }}
      />

      {/* F1: id="main-content" on first content section */}
      <section id="main-content" className="max-w-4xl mx-auto px-8 py-16">
        <h1 className="text-5xl font-serif text-gray-900 mb-4">Menu</h1>
        <p className="text-lg text-gray-700">
          Explore our carefully curated selection of fine dishes, featuring
          seasonal specialties and classic favorites.
        </p>
      </section>

      {/* Categories */}
      <section className="max-w-4xl mx-auto px-8 py-16">
        {categories?.map((category) => (
          <div key={category.name} className="mb-12">
            <h2 className="text-3xl font-serif text-gray-900 mb-2">{category.name}</h2>
            {/* F15: metadata-level text kept at text-gray-700 for sufficient contrast */}
            <p className="text-gray-700 italic mb-6">
              A selection of {category.items.length} items
            </p>

            <div className="space-y-6">
              {category.items.map((item) => (
                <div key={item.id}>
                  <h3 className="text-xl font-serif text-gray-900">{item.name}</h3>
                  <p className="text-gray-700">{item.description}</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    \$${item.price}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      ${renderFooter()}
    </main>
  )
}
  `
}

/**
 * Menu category detail - filtered menu items for a specific category
 */
export function renderCanapeMenuCategory(_context: CanapeRouteContext): string {
  return `
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/menu/$category/')(
  component: MenuCategory
})

function MenuCategory() {
  const { category } = useParams({ from: '/menu/$category/' })

  const { data: items } = useQuery({
    queryKey: ['menu', category],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .eq('category', decodeURIComponent(category))
        .order('name')
      return data
    }
  })

  return (
    <main>
      <section className="max-w-4xl mx-auto px-8 py-16">
        <h1 className="text-4xl font-serif text-gray-900 mb-6">
          {decodeURIComponent(category)}
        </h1>

        <div className="space-y-6 mb-12">
          {items?.map((item) => (
            <div key={item.id}>
              <h3 className="text-xl font-serif text-gray-900">{item.name}</h3>
              <p className="text-gray-700">{item.description}</p>
              <p className="text-lg font-bold text-gray-900 mt-1">\$${item.price}</p>
            </div>
          ))}
        </div>

        {/* Category Navigation */}
        <div className="flex gap-4 text-sm">
          <a href="/menu/appetizers/" className="text-blue-600 hover:underline">Appetizers</a>
          <a href="/menu/mains/" className="text-blue-600 hover:underline">Mains</a>
          <a href="/menu/desserts/" className="text-blue-600 hover:underline">Desserts</a>
        </div>
      </section>

      ${renderFooter()}
    </main>
  )
}
  `
}

/**
 * News/blog archive with pagination
 */
export function renderCanapeNewsArchive(_context: CanapeRouteContext): string {
  return `
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/news/')(
  component: NewsArchive
})

function NewsArchive() {
  const [page, setPage] = useState(1)
  const postsPerPage = 10

  const { data: posts } = useQuery({
    queryKey: ['news', page],
    queryFn: async () => {
      const { data } = await supabase
        .from('posts')
        .select('*')
        .order('published_at', { ascending: false })
        .range((page - 1) * postsPerPage, page * postsPerPage - 1)
      return data
    }
  })

  return (
    <main>
      {/* F1: Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-white focus:text-gray-900 focus:rounded focus:ring-2 focus:ring-blue-500"
      >
        Skip to main content
      </a>

      {/* F1: id="main-content" on first content section */}
      <section id="main-content" className="max-w-4xl mx-auto px-8 py-16">
        <h1 className="text-4xl font-serif text-gray-900 mb-8">News &amp; Updates</h1>

        {posts?.map((post) => (
          <article key={post.id} className="mb-12 pb-12 border-b">
            {post.featured_image && (
              <img
                src={post.featured_image}
                alt={post.title}
                className="w-full h-64 object-cover mb-4 rounded"
              />
            )}

            <h2 className="text-2xl font-serif text-gray-900 mb-2 hover:text-blue-600">
              <a href={\`/news/\${post.slug}\`}>{post.title}</a>
            </h2>

            {/* F15: small metadata text — text-gray-700 for sufficient contrast */}
            <div className="text-sm text-gray-700 mb-4">
              {post.featured && <span className="mr-4 font-semibold">Featured</span>}
              {post.comment_count > 0 && (
                <a href={\`/news/\${post.slug}#comments\`}>
                  {post.comment_count} {post.comment_count === 1 ? 'Comment' : 'Comments'}
                </a>
              )}
            </div>

            <p className="text-gray-700">{post.excerpt}</p>
          </article>
        ))}

        {/* Pagination */}
        <div className="flex gap-4 justify-center">
          {page > 1 && (
            <button
              onClick={() => setPage(page - 1)}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              &#8592; Newer Posts
            </button>
          )}
          {posts && posts.length === postsPerPage && (
            <button
              onClick={() => setPage(page + 1)}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Older Posts &#8594;
            </button>
          )}
        </div>
      </section>

      ${renderFooter()}
    </main>
  )
}
  `
}

/**
 * Individual blog post with multi-page support
 */
export function renderCanapePost(_context: CanapeRouteContext): string {
  return `
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/news/$slug/')(
  component: NewsPost
})

function NewsPost() {
  const { slug } = useParams({ from: '/news/$slug/' })
  const [currentPage, setCurrentPage] = useState(1)

  const { data: post } = useQuery({
    queryKey: ['post', slug],
    queryFn: async () => {
      const { data } = await supabase
        .from('posts')
        .select('*')
        .eq('slug', slug)
        .single()
      return data
    }
  })

  if (!post) return <div>Loading...</div>

  // Split multi-page posts by page break delimiter
  const pages = post.content?.split('<!-- page break -->') || [post.content || '']
  const currentContent = pages[currentPage - 1]

  return (
    <main className="max-w-4xl mx-auto px-8 py-16">
      <h1 className="text-4xl font-serif text-gray-900 mb-4">{post.title}</h1>

      {/* F15: metadata-level text — text-gray-700 for sufficient contrast */}
      <div className="text-sm text-gray-700 mb-8">
        {/* F11: <time> element with dateTime attribute */}
        <time dateTime={post.published_at}>{new Date(post.published_at).toLocaleDateString()}</time>
        {post.comment_count > 0 && (
          <a href="#comments" className="ml-4">
            {post.comment_count} {post.comment_count === 1 ? 'Comment' : 'Comments'}
          </a>
        )}
      </div>

      {post.featured_image && (
        <img
          src={post.featured_image}
          alt={post.title}
          className="w-full h-96 object-cover mb-8 rounded"
        />
      )}

      <article className="prose prose-lg max-w-none mb-8">
        {currentContent}
      </article>

      {/* Multi-page pagination */}
      {pages.length > 1 && (
        <div className="flex gap-2 justify-center py-8 border-t">
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i + 1)}
              aria-label={\`Go to page \${i + 1}\`}
              aria-current={i + 1 === currentPage ? 'page' : undefined}
              className={\`w-8 h-8 border rounded \${
                i + 1 === currentPage
                  ? 'bg-gray-900 text-white'
                  : 'border-gray-300 hover:bg-gray-50'
              }\`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      ${renderSidebar()}
      ${renderFooter()}
    </main>
  )
}
  `
}

/**
 * Generic page renderer for static pages (catering, private chef services, etc)
 */
export function renderCanapePage(_context: CanapeRouteContext): string {
  return `
import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/$slug/')(
  component: Page
})

function Page() {
  const { slug } = useParams({ from: '/$slug/' })

  const { data: page } = useQuery({
    queryKey: ['page', slug],
    queryFn: async () => {
      const { data } = await supabase
        .from('pages')
        .select('*')
        .eq('slug', slug)
        .single()
      return data
    }
  })

  if (!page) return <div>Page not found</div>

  return (
    <main>
      {/* F1: Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-white focus:text-gray-900 focus:rounded focus:ring-2 focus:ring-blue-500"
      >
        Skip to main content
      </a>

      {/* F14: Decorative page hero — role="presentation" aria-hidden="true" */}
      <div
        role="presentation"
        aria-hidden="true"
        className="w-full h-[530px] bg-cover bg-center bg-black/40"
        style={{
          backgroundImage: \`url('https://picsum.photos/1200/600?random=3')\`,
          backgroundBlendMode: 'overlay'
        }}
      />

      {/* F1: id="main-content" on first content section */}
      <section id="main-content" className="max-w-4xl mx-auto px-8 py-16">
        <h1 className="text-4xl font-serif text-gray-900 mb-8">{page.title}</h1>
        <article className="prose prose-lg max-w-none mb-12">
          {page.content}
        </article>

        <div className="flex gap-8">
          ${renderSidebar()}
        </div>
      </section>

      ${renderFooter()}
    </main>
  )
}
  `
}

/**
 * Reservations page with contact form
 */
export function renderCanapeReservations(_context: CanapeRouteContext): string {
  return `
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/reservations/')(
  component: Reservations
})

function Reservations() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    partySize: '1',
    phone: '',
    date: '',
    time: '',
    requests: ''
  })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Save reservation to database
    await supabase.from('reservations').insert({
      ...formData,
      created_at: new Date()
    })

    setSubmitted(true)
    setTimeout(() => {
      setFormData({
        name: '',
        email: '',
        partySize: '1',
        phone: '',
        date: '',
        time: '',
        requests: ''
      })
      setSubmitted(false)
    }, 3000)
  }

  return (
    <main>
      {/* F1: Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-white focus:text-gray-900 focus:rounded focus:ring-2 focus:ring-blue-500"
      >
        Skip to main content
      </a>

      {/* F14: Decorative reservations hero — role="presentation" aria-hidden="true" */}
      <div
        role="presentation"
        aria-hidden="true"
        className="w-full h-[530px] bg-cover bg-center bg-black/40"
        style={{
          backgroundImage: \`url('https://picsum.photos/1200/600?random=4')\`,
          backgroundBlendMode: 'overlay'
        }}
      />

      {/* F1: id="main-content" on first content section */}
      <section id="main-content" className="max-w-4xl mx-auto px-8 py-16">
        <h1 className="text-4xl font-serif text-gray-900 mb-8">Reservations</h1>

        <p className="text-lg text-gray-700 mb-8">
          Reserve your table online or call us directly. We look forward to serving you!
        </p>

        {submitted ? (
          <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded mb-8">
            &#10003; Thank you for your reservation! We'll confirm shortly.
          </div>
        ) : null}

        {/* F5: Reservations form with htmlFor/id label associations */}
        <form onSubmit={handleSubmit} className="space-y-6 mb-12">
          <div>
            <label htmlFor="res-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="res-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded"
              required
            />
          </div>

          <div>
            <label htmlFor="res-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id="res-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded"
              required
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="res-party-size" className="block text-sm font-medium text-gray-700 mb-1">Party Size</label>
              <select
                id="res-party-size"
                value={formData.partySize}
                onChange={(e) => setFormData({ ...formData, partySize: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? 'Person' : 'People'}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="res-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                id="res-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="res-date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                id="res-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded"
                required
              />
            </div>

            <div>
              <label htmlFor="res-time" className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input
                id="res-time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="res-requests" className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
            <textarea
              id="res-requests"
              value={formData.requests}
              onChange={(e) => setFormData({ ...formData, requests: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded"
              rows={4}
            />
          </div>

          <button
            type="submit"
            className="w-full px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
          >
            Reserve Table
          </button>
        </form>

        <div className="flex gap-8">
          ${renderSidebar()}
        </div>
      </section>

      ${renderFooter()}
    </main>
  )
}
  `
}

// ============================================================================
// ADMIN ROUTES (Private, Auth-protected)
// ============================================================================

/**
 * Admin list page for entities with CRUD operations
 */
export function renderCanapeAdminEntities(_context: CanapeRouteContext): string {
  return `
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/admin/entities/')(
  component: AdminEntities
})

function AdminEntities() {
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image_url: ''
  })

  const { data: entities, refetch } = useQuery({
    queryKey: ['admin', 'entities'],
    queryFn: async () => {
      const { data } = await supabase
        .from('entities')
        .select('*')
      return data
    }
  })

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const { data: result } = await supabase
        .from('entities')
        .insert([data])
      return result
    },
    onSuccess: () => {
      refetch()
      setFormData({ name: '', description: '', image_url: '' })
      setShowForm(false)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await supabase
        .from('entities')
        .delete()
        .eq('id', id)
    },
    onSuccess: () => refetch()
  })

  return (
    <main className="max-w-6xl mx-auto px-8 py-16">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Featured Items</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Add Item
        </button>
      </div>

      {showForm && (
        {/* F6: Admin entities form with explicit labels for all inputs */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate(formData)
          }}
          className="bg-gray-50 p-6 rounded mb-8 space-y-4"
        >
          <div>
            <label htmlFor="admin-ent-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="admin-ent-name"
              type="text"
              placeholder="Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="admin-ent-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              id="admin-ent-description"
              placeholder="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          <div>
            <label htmlFor="admin-ent-image-url" className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
            <input
              id="admin-ent-image-url"
              type="url"
              placeholder="Image URL"
              value={formData.image_url}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded">
            Save
          </button>
        </form>
      )}

      <div className="space-y-4">
        {entities?.map((entity) => (
          <div key={entity.id} className="border rounded p-4 flex justify-between items-start">
            <div className="flex-1">
              <h3 className="font-bold text-lg">{entity.name}</h3>
              <p className="text-gray-700">{entity.description}</p>
              {entity.image_url && (
                <img src={entity.image_url} alt={entity.name} className="mt-2 h-20 object-cover rounded" />
              )}
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
                Edit
              </button>
              <button
                onClick={() => deleteMutation.mutate(entity.id)}
                className="px-3 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
  `
}

/**
 * Admin list page for menu items
 */
export function renderCanapeAdminMenuItems(_context: CanapeRouteContext): string {
  return `
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/admin/menu-items/')(
  component: AdminMenuItems
})

function AdminMenuItems() {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'Appetizers',
    price: '0'
  })

  const { data: items, refetch } = useQuery({
    queryKey: ['admin', 'menu-items'],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .order('category')
      return data
    }
  })

  const createMutation = useMutation({
    mutationFn: async (data) => {
      await supabase.from('menu_items').insert([{
        ...data,
        price: parseFloat(data.price)
      }])
    },
    onSuccess: () => {
      refetch()
      setFormData({ name: '', description: '', category: 'Appetizers', price: '0' })
      setShowForm(false)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await supabase.from('menu_items').delete().eq('id', id)
    },
    onSuccess: () => refetch()
  })

  return (
    <main className="max-w-6xl mx-auto px-8 py-16">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Menu Items</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          + Add Item
        </button>
      </div>

      {showForm && (
        {/* F6: Admin menu items form with explicit labels for all inputs */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate(formData)
          }}
          className="bg-gray-50 p-6 rounded mb-8 space-y-4"
        >
          <div>
            <label htmlFor="admin-menu-name" className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
            <input
              id="admin-menu-name"
              type="text"
              placeholder="Item Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label htmlFor="admin-menu-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              id="admin-menu-description"
              placeholder="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          <div>
            <label htmlFor="admin-menu-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              id="admin-menu-category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-2 border rounded"
            >
              <option>Appetizers</option>
              <option>Mains</option>
              <option>Desserts</option>
              <option>Beverages</option>
            </select>
          </div>
          <div>
            <label htmlFor="admin-menu-price" className="block text-sm font-medium text-gray-700 mb-1">Price</label>
            <input
              id="admin-menu-price"
              type="number"
              placeholder="Price"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              className="w-full px-4 py-2 border rounded"
              step="0.01"
              required
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded">
            Save Item
          </button>
        </form>
      )}

      <div className="grid gap-4">
        {items?.map((item) => (
          <div key={item.id} className="border rounded p-4 flex justify-between">
            <div className="flex-1">
              <h3 className="font-bold">{item.name}</h3>
              <p className="text-sm text-gray-700">{item.description}</p>
              <div className="flex gap-4 mt-2 text-sm">
                <span className="bg-gray-100 px-2 py-1 rounded">{item.category}</span>
                <span className="font-semibold">\${item.price}</span>
              </div>
            </div>
            <button
              onClick={() => deleteMutation.mutate(item.id)}
              className="px-3 py-1 bg-red-50 text-red-600 rounded"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}
  `
}

/**
 * Admin detail/edit page for a single entity (by $id param)
 */
export function renderCanapeAdminEntityDetail(_context: CanapeRouteContext): string {
  return `
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/admin/entities/$id')({
  component: AdminEntityDetail
})

function AdminEntityDetail() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({ name: '', description: '', image_url: '' })

  const { data: entity, isPending, error } = useQuery({
    queryKey: ['admin', 'entities', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('entities').select('*').eq('id', id).single()
      if (error) throw error
      return data
    }
  })

  useEffect(() => {
    if (entity) {
      setFormData({
        name: entity.name ?? '',
        description: entity.description ?? '',
        image_url: entity.image_url ?? ''
      })
    }
  }, [entity])

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('entities').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('entities').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
      window.history.back()
    }
  })

  if (isPending) return <div className="p-8" role="status">Loading...</div>
  if (error) return <div className="p-8 text-red-600" role="alert">{error.message}</div>
  if (!entity) return <div className="p-8">Not found</div>

  return (
    <main className="max-w-3xl mx-auto px-8 py-16">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Edit: {entity.name}</h1>
        <Link to="/_authenticated/admin/entities" className="text-blue-600 hover:underline text-sm">&larr; Back to list</Link>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(formData) }}
        className="space-y-6"
      >
        <div>
          <label htmlFor="edit-ent-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input id="edit-ent-name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 border rounded" required />
        </div>
        <div>
          <label htmlFor="edit-ent-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea id="edit-ent-description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-4 py-2 border rounded" rows={4} />
        </div>
        <div>
          <label htmlFor="edit-ent-image-url" className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
          <input id="edit-ent-image-url" type="url" value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} className="w-full px-4 py-2 border rounded" />
        </div>

        {entity.image_url && (
          <img src={entity.image_url} alt={entity.name} className="h-32 object-cover rounded" />
        )}

        <div className="flex gap-4 pt-4 border-t">
          <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => { if (window.confirm('Delete this item permanently?')) deleteMutation.mutate() }} className="px-6 py-2 bg-red-50 text-red-600 rounded hover:bg-red-100">
            Delete
          </button>
        </div>

        {updateMutation.isSuccess && <p className="text-green-600 text-sm" role="status">Changes saved successfully.</p>}
        {updateMutation.isError && <p className="text-red-600 text-sm" role="alert">Error saving changes.</p>}
      </form>
    </main>
  )
}
  `
}

/**
 * Admin detail/edit page for a single menu item (by $id param)
 */
export function renderCanapeAdminMenuItemDetail(_context: CanapeRouteContext): string {
  return `
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/admin/menu-items/$id')({
  component: AdminMenuItemDetail
})

function AdminMenuItemDetail() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({ name: '', description: '', category: 'Appetizers', price: '0' })

  const { data: item, isPending, error } = useQuery({
    queryKey: ['admin', 'menu-items', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('menu_items').select('*').eq('id', id).single()
      if (error) throw error
      return data
    }
  })

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name ?? '',
        description: item.description ?? '',
        category: item.category ?? 'Appetizers',
        price: String(item.price ?? '0')
      })
    }
  }, [item])

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('menu_items').update({ ...data, price: parseFloat(data.price) }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'menu-items'] })
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('menu_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'menu-items'] })
      window.history.back()
    }
  })

  if (isPending) return <div className="p-8" role="status">Loading...</div>
  if (error) return <div className="p-8 text-red-600" role="alert">{error.message}</div>
  if (!item) return <div className="p-8">Not found</div>

  return (
    <main className="max-w-3xl mx-auto px-8 py-16">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Edit: {item.name}</h1>
        <Link to="/_authenticated/admin/menu-items" className="text-blue-600 hover:underline text-sm">&larr; Back to list</Link>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(formData) }}
        className="space-y-6"
      >
        <div>
          <label htmlFor="edit-menu-name" className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
          <input id="edit-menu-name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 border rounded" required />
        </div>
        <div>
          <label htmlFor="edit-menu-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea id="edit-menu-description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-4 py-2 border rounded" rows={4} />
        </div>
        <div>
          <label htmlFor="edit-menu-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select id="edit-menu-category" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full px-4 py-2 border rounded">
            <option>Appetizers</option>
            <option>Mains</option>
            <option>Desserts</option>
            <option>Beverages</option>
          </select>
        </div>
        <div>
          <label htmlFor="edit-menu-price" className="block text-sm font-medium text-gray-700 mb-1">Price</label>
          <input id="edit-menu-price" type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="w-full px-4 py-2 border rounded" step="0.01" required />
        </div>

        <div className="flex gap-4 pt-4 border-t">
          <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => { if (window.confirm('Delete this menu item permanently?')) deleteMutation.mutate() }} className="px-6 py-2 bg-red-50 text-red-600 rounded hover:bg-red-100">
            Delete
          </button>
        </div>

        {updateMutation.isSuccess && <p className="text-green-600 text-sm" role="status">Changes saved successfully.</p>}
        {updateMutation.isError && <p className="text-red-600 text-sm" role="alert">Error saving changes.</p>}
      </form>
    </main>
  )
}
  `
}

// Export all routes
export const CanapeRoutes = {
  homepage: renderCanapeHomepage,
  menuArchive: renderCanapeMenuArchive,
  menuCategory: renderCanapeMenuCategory,
  newsArchive: renderCanapeNewsArchive,
  post: renderCanapePost,
  page: renderCanapePage,
  reservations: renderCanapeReservations,
  adminEntities: renderCanapeAdminEntities,
  adminMenuItems: renderCanapeAdminMenuItems,
  adminEntityDetail: renderCanapeAdminEntityDetail,
  adminMenuItemDetail: renderCanapeAdminMenuItemDetail
}
