import { describe, it, expect } from 'vitest'
import {
  assembleProductDetailPage,
  assembleArticleReaderPage,
  assembleProfileCardPage,
  assembleAppointmentCardPage,
} from '@server/lib/skills/detail'
import type { SkillProps } from '@server/lib/skills/index'
import type { SchemaContract } from '@server/lib/schema-contract'
import { inferPageConfig, derivePageFeatureSpec } from '@server/lib/agents/feature-schema'

// ============================================================================
// Test fixture factory
// ============================================================================

function makeProps(
  entityName: string,
  columns: { name: string; type: string; nullable?: boolean }[],
): SkillProps {
  const contract: SchemaContract = {
    tables: [
      {
        name: entityName,
        columns: [
          { name: 'id', type: 'uuid', nullable: false, default: 'gen_random_uuid()' },
          ...columns.map((c) => ({ ...c, nullable: c.nullable ?? true })),
        ],
        rlsPolicies: [],
      },
    ],
  }
  const table = contract.tables[0]
  const pageConfig = inferPageConfig(table, contract)
  const spec = derivePageFeatureSpec(pageConfig, contract)
  return {
    entity: entityName,
    contract,
    spec,
    layout: { listSkill: 'CardGrid', detailSkill: 'ProductDetail', hasDashboard: false },
    primaryColor: '#f43f5e',
    fontFamily: 'Inter',
    heroImages: [],
  }
}

// ============================================================================
// assembleProductDetailPage
// ============================================================================

describe('assembleProductDetailPage', () => {
  it('generates a non-empty string', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(typeof code).toBe('string')
    expect(code.length).toBeGreaterThan(0)
  })

  it('generates detail page with correct route', () => {
    const props = makeProps('recipe', [
      { name: 'name', type: 'text' },
      { name: 'image_url', type: 'text' },
      { name: 'description', type: 'text' },
    ])
    const code = assembleProductDetailPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/recipes/$id')")
    expect(code).toContain('useQuery')
    expect(code).toContain('useMutation')
  })

  it('includes image field when image column exists', () => {
    const props = makeProps('product', [
      { name: 'name', type: 'text' },
      { name: 'image_url', type: 'text' },
    ])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('image_url')
  })

  it('uses gradient fallback when no image column', () => {
    const props = makeProps('category', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('gradient')
  })

  it('includes edit form with isEditing state', () => {
    const props = makeProps('watch', [
      { name: 'name', type: 'text' },
      { name: 'brand', type: 'text' },
    ])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('isEditing')
    expect(code).toContain('editForm')
  })

  it('includes supabase query for the entity', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).toContain("supabase.from('recipe').select('*').eq('id', id).single()")
  })

  it('includes supabase update mutation', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).toContain("supabase.from('recipe').update(values).eq('id', id)")
  })

  it('uses isPending not isLoading (TanStack Query v5)', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('isPending')
    expect(code).not.toContain('.isLoading')
  })

  it('uses Route.useParams for id', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('const { id } = Route.useParams()')
  })

  it('includes back navigation link', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('Link')
    expect(code).toContain('/recipes')
  })

  it('does not contain SLOT markers or return null', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).not.toContain('SLOT')
    expect(code).not.toContain('return null')
  })

  it('uses editForm for mutation payload', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('.mutate(editForm)')
  })

  it('shows price field when price column exists', () => {
    const props = makeProps('product', [
      { name: 'name', type: 'text' },
      { name: 'price', type: 'numeric' },
    ])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('price')
  })

  it('shows description when desc column exists', () => {
    const props = makeProps('product', [
      { name: 'name', type: 'text' },
      { name: 'description', type: 'text' },
    ])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('description')
  })

  it('generates correct component name', () => {
    const props = makeProps('blog_post', [{ name: 'title', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('BlogPostDetailPage')
  })

  it('does not contain tRPC references', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).not.toContain('trpc')
    expect(code).not.toContain('tRPC')
  })

  it('includes ArrowLeft back navigation icon', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleProductDetailPage(props)
    expect(code).toContain('ArrowLeft')
  })
})

// ============================================================================
// assembleArticleReaderPage
// ============================================================================

describe('assembleArticleReaderPage', () => {
  it('generates a non-empty string', () => {
    const props = makeProps('article', [{ name: 'title', type: 'text' }])
    const code = assembleArticleReaderPage(props)
    expect(typeof code).toBe('string')
    expect(code.length).toBeGreaterThan(0)
  })

  it('generates reading layout with correct route', () => {
    const props = makeProps('article', [
      { name: 'title', type: 'text' },
      { name: 'body', type: 'text' },
    ])
    const code = assembleArticleReaderPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/articles/$id')")
    expect(code).toContain('body')
  })

  it('uses max-w-3xl article layout', () => {
    const props = makeProps('article', [{ name: 'title', type: 'text' }])
    const code = assembleArticleReaderPage(props)
    expect(code).toContain('max-w-3xl')
    expect(code).toContain('<article')
  })

  it('includes cover image when image column exists', () => {
    const props = makeProps('article', [
      { name: 'title', type: 'text' },
      { name: 'cover_image', type: 'text' },
    ])
    const code = assembleArticleReaderPage(props)
    expect(code).toContain('cover_image')
  })

  it('includes author field when author column exists', () => {
    const props = makeProps('post', [
      { name: 'title', type: 'text' },
      { name: 'author', type: 'text' },
    ])
    const code = assembleArticleReaderPage(props)
    expect(code).toContain('author')
  })

  it('includes date field', () => {
    const props = makeProps('article', [
      { name: 'title', type: 'text' },
      { name: 'published_at', type: 'timestamptz' },
    ])
    const code = assembleArticleReaderPage(props)
    expect(code).toContain('published_at')
    expect(code).toContain('toLocaleDateString')
  })

  it('includes supabase query and mutation', () => {
    const props = makeProps('article', [{ name: 'title', type: 'text' }])
    const code = assembleArticleReaderPage(props)
    expect(code).toContain("supabase.from('article').select('*').eq('id', id).single()")
    expect(code).toContain("supabase.from('article').update(values).eq('id', id)")
  })

  it('does not embed JSON.stringify in generated output', () => {
    const props = makeProps('article', [
      { name: 'title', type: 'text' },
      { name: 'body', type: 'text' },
    ])
    const code = assembleArticleReaderPage(props)
    expect(code).not.toContain('JSON.stringify(spec')
    expect(code).not.toContain('JSON.stringify(s.')
  })

  it('uses isPending not isLoading', () => {
    const props = makeProps('article', [{ name: 'title', type: 'text' }])
    const code = assembleArticleReaderPage(props)
    expect(code).toContain('isPending')
    expect(code).not.toContain('.isLoading')
  })

  it('includes edit toggle', () => {
    const props = makeProps('article', [{ name: 'title', type: 'text' }])
    const code = assembleArticleReaderPage(props)
    expect(code).toContain('isEditing')
    expect(code).toContain('editForm')
  })

  it('generates correct component name', () => {
    const props = makeProps('blog_post', [{ name: 'title', type: 'text' }])
    const code = assembleArticleReaderPage(props)
    expect(code).toContain('BlogPostReaderPage')
  })
})

// ============================================================================
// assembleProfileCardPage
// ============================================================================

describe('assembleProfileCardPage', () => {
  it('generates a non-empty string', () => {
    const props = makeProps('author', [{ name: 'name', type: 'text' }])
    const code = assembleProfileCardPage(props)
    expect(typeof code).toBe('string')
    expect(code.length).toBeGreaterThan(0)
  })

  it('generates profile page with correct route', () => {
    const props = makeProps('author', [
      { name: 'name', type: 'text' },
      { name: 'bio', type: 'text' },
      { name: 'avatar_url', type: 'text' },
    ])
    const code = assembleProfileCardPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/authors/$id')")
  })

  it('includes avatar field when avatar column exists', () => {
    const props = makeProps('author', [
      { name: 'name', type: 'text' },
      { name: 'avatar_url', type: 'text' },
    ])
    const code = assembleProfileCardPage(props)
    expect(code).toContain('avatar_url')
  })

  it('includes bio field when bio column exists', () => {
    const props = makeProps('author', [
      { name: 'name', type: 'text' },
      { name: 'bio', type: 'text' },
    ])
    const code = assembleProfileCardPage(props)
    expect(code).toContain('bio')
  })

  it('includes email link when email column exists', () => {
    const props = makeProps('author', [
      { name: 'name', type: 'text' },
      { name: 'email', type: 'text' },
    ])
    const code = assembleProfileCardPage(props)
    expect(code).toContain('email')
    expect(code).toContain('mailto')
  })

  it('includes website link when website column exists', () => {
    const props = makeProps('author', [
      { name: 'name', type: 'text' },
      { name: 'website_url', type: 'text' },
    ])
    const code = assembleProfileCardPage(props)
    expect(code).toContain('website_url')
  })

  it('uses rounded-full avatar with fallback initial', () => {
    const props = makeProps('author', [{ name: 'name', type: 'text' }])
    const code = assembleProfileCardPage(props)
    expect(code).toContain('rounded-full')
    expect(code).toContain('charAt(0)')
  })

  it('includes supabase query and mutation', () => {
    const props = makeProps('author', [{ name: 'name', type: 'text' }])
    const code = assembleProfileCardPage(props)
    expect(code).toContain("supabase.from('author').select('*').eq('id', id).single()")
    expect(code).toContain("supabase.from('author').update(values).eq('id', id)")
  })

  it('uses isPending not isLoading', () => {
    const props = makeProps('author', [{ name: 'name', type: 'text' }])
    const code = assembleProfileCardPage(props)
    expect(code).toContain('isPending')
    expect(code).not.toContain('.isLoading')
  })

  it('includes edit toggle', () => {
    const props = makeProps('author', [{ name: 'name', type: 'text' }])
    const code = assembleProfileCardPage(props)
    expect(code).toContain('isEditing')
    expect(code).toContain('editForm')
  })

  it('generates correct component name', () => {
    const props = makeProps('team_member', [{ name: 'name', type: 'text' }])
    const code = assembleProfileCardPage(props)
    expect(code).toContain('TeamMemberProfilePage')
  })

  it('includes Mail and Globe icons in imports', () => {
    const props = makeProps('author', [{ name: 'name', type: 'text' }])
    const code = assembleProfileCardPage(props)
    expect(code).toContain('Mail')
    expect(code).toContain('Globe')
  })
})

// ============================================================================
// assembleAppointmentCardPage
// ============================================================================

describe('assembleAppointmentCardPage', () => {
  it('generates a non-empty string', () => {
    const props = makeProps('appointment', [{ name: 'title', type: 'text' }])
    const code = assembleAppointmentCardPage(props)
    expect(typeof code).toBe('string')
    expect(code.length).toBeGreaterThan(0)
  })

  it('generates appointment page with correct route', () => {
    const props = makeProps('appointment', [
      { name: 'title', type: 'text' },
      { name: 'scheduled_at', type: 'timestamptz' },
      { name: 'status', type: 'text' },
    ])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/appointments/$id')")
  })

  it('includes date field with toLocaleDateString', () => {
    const props = makeProps('appointment', [
      { name: 'title', type: 'text' },
      { name: 'scheduled_at', type: 'timestamptz' },
    ])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('scheduled_at')
    expect(code).toContain('toLocaleDateString')
  })

  it('includes time display when date column present', () => {
    const props = makeProps('appointment', [
      { name: 'title', type: 'text' },
      { name: 'scheduled_at', type: 'timestamptz' },
    ])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('toLocaleTimeString')
  })

  it('includes status badge when status column exists', () => {
    const props = makeProps('appointment', [
      { name: 'title', type: 'text' },
      { name: 'status', type: 'text' },
    ])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('status')
    expect(code).toContain('statusColorMap')
  })

  it('includes status color map for pending/confirmed/completed/cancelled', () => {
    const props = makeProps('appointment', [
      { name: 'title', type: 'text' },
      { name: 'status', type: 'text' },
    ])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('pending')
    expect(code).toContain('confirmed')
    expect(code).toContain('completed')
    expect(code).toContain('cancelled')
  })

  it('includes notes/description when notes column exists', () => {
    const props = makeProps('appointment', [
      { name: 'title', type: 'text' },
      { name: 'notes', type: 'text' },
    ])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('notes')
  })

  it('includes Calendar icon in imports', () => {
    const props = makeProps('appointment', [{ name: 'title', type: 'text' }])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('Calendar')
  })

  it('includes supabase query and mutation', () => {
    const props = makeProps('appointment', [{ name: 'title', type: 'text' }])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain("supabase.from('appointment').select('*').eq('id', id).single()")
    expect(code).toContain("supabase.from('appointment').update(values).eq('id', id)")
  })

  it('uses isPending not isLoading', () => {
    const props = makeProps('appointment', [{ name: 'title', type: 'text' }])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('isPending')
    expect(code).not.toContain('.isLoading')
  })

  it('includes edit toggle', () => {
    const props = makeProps('appointment', [{ name: 'title', type: 'text' }])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('isEditing')
    expect(code).toContain('editForm')
  })

  it('generates correct component name', () => {
    const props = makeProps('booking_slot', [{ name: 'title', type: 'text' }])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('BookingSlotAppointmentPage')
  })

  it('includes back navigation link', () => {
    const props = makeProps('appointment', [{ name: 'title', type: 'text' }])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('Link')
    expect(code).toContain('/appointments')
  })

  it('uses Card component for appointment display', () => {
    const props = makeProps('appointment', [{ name: 'title', type: 'text' }])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('<Card>')
    expect(code).toContain('CardContent')
  })
})
