/**
 * Canape Theme Route Generators
 *
 * Produces 1:1 visual clones of the Canape WordPress theme
 * - Public routes: homepage, menu, news, pages, reservations
 * - Admin routes: CRUD forms for all content types
 * - Styling: Serif fonts, max-w-4xl containers, py-16 spacing
 */

import type { FeatureSchema } from './feature-schema'

// ============================================================================
// TYPES
// ============================================================================

interface CanapeRouteContext {
  appName: string
  allPublicMeta: FeatureSchema['publicMeta']
  siteEmail?: string
  heroImages: string[]
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================

function escapeJsx(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function imageryFallback(url?: string, index: number = 0): string {
  return url || `https://picsum.photos/1200/600?random=${index}`
}

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
          <p className="text-sm text-gray-600">
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
          <p className="text-sm text-gray-600">
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
      <footer className="border-t mt-16 py-8 text-center text-sm text-gray-600">
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
  meta: FeatureSchema['publicMeta'][0],
  context: CanapeRouteContext
): string {
  return `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

export const Route = createFileRoute('/')(
  component: Home
})

function Home() {
  const [email, setEmail] = useState('')

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
      {/* Hero Section */}
      <div
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

      {/* Welcome Section */}
      <section className="max-w-4xl mx-auto px-8 py-16">
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
                <p className="text-gray-600">{item.description}</p>
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
        <p className="text-gray-600 mb-4">Subscribe to our newsletter for updates and special offers</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            // Handle subscription
            setEmail('')
          }}
          className="flex flex-col sm:flex-row gap-2 justify-center"
        >
          <input
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
export function renderCanapeMenuArchive(context: CanapeRouteContext): string {
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
      {/* Hero */}
      <div
        className="w-full h-[530px] bg-cover bg-center bg-black/40"
        style={{
          backgroundImage: \`url('https://picsum.photos/1200/600?random=2')\`,
          backgroundBlendMode: 'overlay'
        }}
      />

      {/* Title & Intro */}
      <section className="max-w-4xl mx-auto px-8 py-16">
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
            <p className="text-gray-600 italic mb-6">
              A selection of {category.items.length} items
            </p>

            <div className="space-y-6">
              {category.items.map((item) => (
                <div key={item.id}>
                  <h3 className="text-xl font-serif text-gray-900">{item.name}</h3>
                  <p className="text-gray-600">{item.description}</p>
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
export function renderCanapeMenuCategory(context: CanapeRouteContext): string {
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
              <p className="text-gray-600">{item.description}</p>
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
export function renderCanapeNewsArchive(context: CanapeRouteContext): string {
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
      <section className="max-w-4xl mx-auto px-8 py-16">
        <h1 className="text-4xl font-serif text-gray-900 mb-8">News & Updates</h1>

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

            <div className="text-sm text-gray-600 mb-4">
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
              ← Newer Posts
            </button>
          )}
          {posts && posts.length === postsPerPage && (
            <button
              onClick={() => setPage(page + 1)}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Older Posts →
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
export function renderCanapePost(context: CanapeRouteContext): string {
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

      <div className="text-sm text-gray-600 mb-8">
        <time>{new Date(post.published_at).toLocaleDateString()}</time>
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
export function renderCanapePage(context: CanapeRouteContext): string {
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
      <div
        className="w-full h-[530px] bg-cover bg-center bg-black/40"
        style={{
          backgroundImage: \`url('https://picsum.photos/1200/600?random=3')\`,
          backgroundBlendMode: 'overlay'
        }}
      />

      <section className="max-w-4xl mx-auto px-8 py-16">
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
export function renderCanapeReservations(context: CanapeRouteContext): string {
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
      <div
        className="w-full h-[530px] bg-cover bg-center bg-black/40"
        style={{
          backgroundImage: \`url('https://picsum.photos/1200/600?random=4')\`,
          backgroundBlendMode: 'overlay'
        }}
      />

      <section className="max-w-4xl mx-auto px-8 py-16">
        <h1 className="text-4xl font-serif text-gray-900 mb-8">Reservations</h1>

        <p className="text-lg text-gray-700 mb-8">
          Reserve your table online or call us directly. We look forward to serving you!
        </p>

        {submitted ? (
          <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded mb-8">
            ✓ Thank you for your reservation! We'll confirm shortly.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6 mb-12">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded"
              required
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Party Size</label>
              <select
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
            <textarea
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
export function renderCanapeAdminEntities(context: CanapeRouteContext): string {
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
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate(formData)
          }}
          className="bg-gray-50 p-6 rounded mb-8 space-y-4"
        >
          <input
            type="text"
            placeholder="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border rounded"
            required
          />
          <textarea
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border rounded"
          />
          <input
            type="url"
            placeholder="Image URL"
            value={formData.image_url}
            onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
            className="w-full px-4 py-2 border rounded"
          />
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
              <p className="text-gray-600">{entity.description}</p>
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
export function renderCanapeAdminMenuItems(context: CanapeRouteContext): string {
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
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate(formData)
          }}
          className="bg-gray-50 p-6 rounded mb-8 space-y-4"
        >
          <input
            type="text"
            placeholder="Item Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border rounded"
            required
          />
          <textarea
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border rounded"
          />
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="w-full px-4 py-2 border rounded"
          >
            <option>Appetizers</option>
            <option>Mains</option>
            <option>Desserts</option>
            <option>Beverages</option>
          </select>
          <input
            type="number"
            placeholder="Price"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            className="w-full px-4 py-2 border rounded"
            step="0.01"
            required
          />
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
              <p className="text-sm text-gray-600">{item.description}</p>
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
  adminMenuItems: renderCanapeAdminMenuItems
}
