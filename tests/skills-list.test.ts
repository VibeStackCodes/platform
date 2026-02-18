import { describe, it, expect, vi } from 'vitest'
import {
  assembleCardGridPage,
  assembleMenuGridPage,
  assembleMagazineGridPage,
  assembleTransactionFeedPage,
  assembleAuthorProfilesPage,
} from '@server/lib/skills/list'
import type { SkillProps } from '@server/lib/skills/index'
import type { SchemaContract } from '@server/lib/schema-contract'
import { inferPageConfig, derivePageFeatureSpec } from '@server/lib/agents/feature-schema'

// Suppress coercion warnings in tests
vi.spyOn(console, 'warn').mockImplementation(() => {})

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
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          ...columns.map(c => ({ ...c, nullable: c.nullable ?? true })),
        ],
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
    layout: { listSkill: 'CardGrid', detailSkill: 'FormSheet', hasDashboard: false },
    primaryColor: '#f43f5e',
    fontFamily: 'Inter',
    heroImages: [],
  }
}

// ── assembleCardGridPage ───────────────────────────────────────────────────────

describe('assembleCardGridPage', () => {
  it('generates valid React component string for recipe entity', () => {
    const props = makeProps('recipe', [
      { name: 'name', type: 'text' },
      { name: 'image_url', type: 'text' },
    ])
    const code = assembleCardGridPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/recipes')")
    expect(code).toContain('supabase.from')
    expect(code).toContain('useQuery')
    expect(code).toContain('useMutation')
  })

  it('includes image field rendering when image column exists', () => {
    const props = makeProps('recipe', [
      { name: 'name', type: 'text' },
      { name: 'image_url', type: 'text' },
    ])
    const code = assembleCardGridPage(props)
    expect(code).toContain('image_url')
  })

  it('falls back to gradient when no image column', () => {
    const props = makeProps('widget', [
      { name: 'name', type: 'text' },
    ])
    const code = assembleCardGridPage(props)
    expect(code).toContain('gradient')
  })

  it('includes create dialog', () => {
    const props = makeProps('book', [{ name: 'title', type: 'text' }, { name: 'author', type: 'text' }])
    const code = assembleCardGridPage(props)
    expect(code).toContain('Dialog')
    expect(code).toContain('DialogTrigger')
  })

  it('uses correct plural route path', () => {
    const props = makeProps('article', [{ name: 'title', type: 'text' }])
    const code = assembleCardGridPage(props)
    expect(code).toContain("/_authenticated/articles")
  })

  it('includes delete mutation', () => {
    const props = makeProps('product', [{ name: 'name', type: 'text' }])
    const code = assembleCardGridPage(props)
    expect(code).toContain('delete')
    expect(code).toContain('Trash2')
  })

  it('uses sortDefault from spec in query', () => {
    const props = makeProps('event', [
      { name: 'title', type: 'text' },
      { name: 'starts_at', type: 'timestamptz' },
    ])
    const code = assembleCardGridPage(props)
    // sortDefault will be 'created_at' (first timestamp) or 'starts_at'
    expect(code).toContain('.order(')
  })

  it('renders textarea for description fields', () => {
    const props = makeProps('note', [
      { name: 'title', type: 'text' },
      { name: 'description', type: 'text' },
    ])
    const code = assembleCardGridPage(props)
    // description → textarea inputType
    expect(code).toContain('Textarea')
  })

  it('renders empty state message', () => {
    const props = makeProps('task', [{ name: 'title', type: 'text' }])
    const code = assembleCardGridPage(props)
    expect(code).toContain(props.spec.listPage.emptyStateMessage)
  })

  it('links cards to detail page', () => {
    const props = makeProps('recipe', [{ name: 'name', type: 'text' }])
    const code = assembleCardGridPage(props)
    expect(code).toContain('to="/recipes/$id"')
  })
})

// ── assembleMenuGridPage ───────────────────────────────────────────────────────

describe('assembleMenuGridPage', () => {
  it('generates menu grid for dish entity', () => {
    const props = makeProps('dish', [
      { name: 'name', type: 'text' },
      { name: 'price', type: 'numeric' },
      { name: 'description', type: 'text' },
    ])
    const code = assembleMenuGridPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/dishes')")
    expect(code).toContain('price')
    expect(code).toContain('toFixed(2)')
  })

  it('shows description field when present', () => {
    const props = makeProps('dish', [
      { name: 'name', type: 'text' },
      { name: 'description', type: 'text' },
    ])
    const code = assembleMenuGridPage(props)
    expect(code).toContain('description')
  })

  it('omits price section when no price column', () => {
    const props = makeProps('menu_item', [{ name: 'name', type: 'text' }])
    const code = assembleMenuGridPage(props)
    // price interpolation should not appear
    expect(code).not.toContain('toFixed')
  })

  it('includes delete button', () => {
    const props = makeProps('dish', [{ name: 'name', type: 'text' }])
    const code = assembleMenuGridPage(props)
    expect(code).toContain('Trash2')
  })

  it('uses divide-y layout', () => {
    const props = makeProps('dish', [{ name: 'name', type: 'text' }])
    const code = assembleMenuGridPage(props)
    expect(code).toContain('divide-y')
  })
})

// ── assembleMagazineGridPage ───────────────────────────────────────────────────

describe('assembleMagazineGridPage', () => {
  it('generates editorial layout with featured item logic', () => {
    const props = makeProps('article', [
      { name: 'title', type: 'text' },
      { name: 'excerpt', type: 'text' },
      { name: 'published_at', type: 'timestamptz' },
    ])
    const code = assembleMagazineGridPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/articles')")
    expect(code).toContain('featured')
    expect(code).toContain('rest')
  })

  it('shows excerpt when excerpt field exists', () => {
    const props = makeProps('post', [
      { name: 'title', type: 'text' },
      { name: 'excerpt', type: 'text' },
    ])
    const code = assembleMagazineGridPage(props)
    expect(code).toContain('excerpt')
  })

  it('uses published_at field for date ordering when present', () => {
    const props = makeProps('article', [
      { name: 'title', type: 'text' },
      { name: 'published_at', type: 'timestamptz' },
    ])
    const code = assembleMagazineGridPage(props)
    expect(code).toContain('published_at')
  })

  it('renders image when cover/image column exists', () => {
    const props = makeProps('article', [
      { name: 'title', type: 'text' },
      { name: 'cover_image', type: 'text' },
    ])
    const code = assembleMagazineGridPage(props)
    expect(code).toContain('cover_image')
  })

  it('uses gradient background when no image column', () => {
    const props = makeProps('article', [{ name: 'title', type: 'text' }])
    const code = assembleMagazineGridPage(props)
    expect(code).toContain('gradient')
  })

  it('links to correct entity detail route', () => {
    const props = makeProps('blog_post', [{ name: 'title', type: 'text' }])
    const code = assembleMagazineGridPage(props)
    expect(code).toContain('blog-posts')
  })
})

// ── assembleTransactionFeedPage ────────────────────────────────────────────────

describe('assembleTransactionFeedPage', () => {
  it('generates transaction feed with amount and running total', () => {
    const props = makeProps('transaction', [
      { name: 'description', type: 'text' },
      { name: 'amount', type: 'numeric' },
      { name: 'category', type: 'text' },
    ])
    const code = assembleTransactionFeedPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/transactions')")
    expect(code).toContain('amount')
    expect(code).toContain('toFixed(2)')
  })

  it('shows total card when amount column exists', () => {
    const props = makeProps('expense', [
      { name: 'name', type: 'text' },
      { name: 'amount', type: 'numeric' },
    ])
    const code = assembleTransactionFeedPage(props)
    expect(code).toContain('Total')
    expect(code).toContain('reduce')
  })

  it('shows category badge when category column exists', () => {
    const props = makeProps('transaction', [
      { name: 'description', type: 'text' },
      { name: 'amount', type: 'numeric' },
      { name: 'category', type: 'text' },
    ])
    const code = assembleTransactionFeedPage(props)
    expect(code).toContain('Badge')
    expect(code).toContain('category')
  })

  it('colors amounts green/red based on positive/negative', () => {
    const props = makeProps('transaction', [
      { name: 'description', type: 'text' },
      { name: 'amount', type: 'numeric' },
    ])
    const code = assembleTransactionFeedPage(props)
    expect(code).toContain('text-green-600')
    expect(code).toContain('text-destructive')
  })

  it('includes delete mutation', () => {
    const props = makeProps('transaction', [{ name: 'description', type: 'text' }])
    const code = assembleTransactionFeedPage(props)
    expect(code).toContain('delete')
    expect(code).toContain('Trash2')
  })

  it('omits total card when no amount column', () => {
    const props = makeProps('log_entry', [{ name: 'message', type: 'text' }])
    const code = assembleTransactionFeedPage(props)
    expect(code).not.toContain('reduce')
  })
})

// ── assembleAuthorProfilesPage ─────────────────────────────────────────────────

describe('assembleAuthorProfilesPage', () => {
  it('generates author profiles grid', () => {
    const props = makeProps('author', [
      { name: 'name', type: 'text' },
      { name: 'bio', type: 'text' },
      { name: 'avatar_url', type: 'text' },
    ])
    const code = assembleAuthorProfilesPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/authors')")
    expect(code).toContain('bio')
    expect(code).toContain('avatar_url')
  })

  it('shows avatar image when avatar column exists', () => {
    const props = makeProps('contributor', [
      { name: 'name', type: 'text' },
      { name: 'avatar', type: 'text' },
    ])
    const code = assembleAuthorProfilesPage(props)
    expect(code).toContain('avatar')
    expect(code).toContain('object-cover')
  })

  it('falls back to initials when no avatar column', () => {
    const props = makeProps('author', [{ name: 'name', type: 'text' }])
    const code = assembleAuthorProfilesPage(props)
    expect(code).toContain('charAt(0).toUpperCase()')
  })

  it('shows role when role column exists', () => {
    const props = makeProps('author', [
      { name: 'name', type: 'text' },
      { name: 'role', type: 'text' },
    ])
    const code = assembleAuthorProfilesPage(props)
    // role field name is passed through as-is in direct contract construction
    // (SchemaContractSchema reserved-word rename only applies when parsing LLM output)
    expect(code).toContain('role')
  })

  it('shows bio with line-clamp when bio column exists', () => {
    const props = makeProps('member', [
      { name: 'name', type: 'text' },
      { name: 'bio', type: 'text' },
    ])
    const code = assembleAuthorProfilesPage(props)
    expect(code).toContain('bio')
    expect(code).toContain('line-clamp-3')
  })

  it('renders profile cards in a grid', () => {
    const props = makeProps('author', [{ name: 'name', type: 'text' }])
    const code = assembleAuthorProfilesPage(props)
    expect(code).toContain('grid')
    expect(code).toContain('Card')
    expect(code).toContain('CardContent')
  })
})
